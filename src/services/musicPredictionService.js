import { log } from '../utils/logger.js';
import musicAnalyticsService from './musicAnalyticsService.js';
import spotifyService from './spotifyService.js';

class MusicPredictionService {
  constructor() {
    // Feature weights for different aspects of prediction
    this.featureWeights = {
      danceability: 0.15,
      energy: 0.15,
      valence: 0.12,
      tempo: 0.10,
      speechiness: 0.08,
      acousticness: 0.10,
      instrumentalness: 0.08,
      liveness: 0.07,
      loudness: 0.08,
      // User behavior weights
      affinityPattern: 0.07  // How user's historical affinity patterns match
    };

    // Similarity thresholds for recommendations
    this.similarityThresholds = {
      veryHigh: 0.85,
      high: 0.75,
      medium: 0.65,
      low: 0.55
    };
  }

  // Get personalized user preferences with custom weighting
  async getUserPersonalizedProfile(userId, customWeights = null) {
    try {
      // Get user's audio feature profile from listening history
      const baseProfile = await musicAnalyticsService.getUserAudioFeatureProfile(userId);
      
      if (!baseProfile) {
        log.warn(`No audio feature profile found for user ${userId}`);
        return null;
      }

      // Apply custom weights if provided
      const weights = customWeights || this.featureWeights;
      
      // Get user's top tracks for pattern analysis
      const topTracks = await musicAnalyticsService.getUserTopTracks(userId, 50);
      
      // Analyze listening patterns
      const listeningPatterns = this.analyzeListeningPatterns(topTracks);
      
      // Create enhanced profile with user customization
      const personalizedProfile = {
        userId,
        audioFeatures: baseProfile.profile,
        listeningPatterns,
        customWeights: weights,
        confidence: baseProfile.confidence,
        preferences: {
          // Derive high-level preferences
          moodPreference: this.deriveMoodPreference(baseProfile.profile),
          energyPreference: this.deriveEnergyPreference(baseProfile.profile),
          danceabilityPreference: this.deriveDanceabilityPreference(baseProfile.profile),
          genreAffinity: this.deriveGenreAffinity(topTracks)
        },
        lastUpdated: new Date()
      };

      return personalizedProfile;

    } catch (error) {
      log.error('Failed to get personalized user profile:', error);
      throw error;
    }
  }

  // Analyze listening patterns from track data
  analyzeListeningPatterns(tracks) {
    if (!tracks || tracks.length === 0) return {};

    const patterns = {
      averageAffinityScore: 0,
      preferredContexts: {},
      timePatterns: {},
      engagementPatterns: {
        averageCompletionRate: 0,
        averageReplayRate: 0,
        skipTolerance: 0
      }
    };

    let totalAffinity = 0;
    let totalCompletion = 0;
    let totalReplay = 0;
    let totalSkip = 0;

    tracks.forEach(track => {
      totalAffinity += track.userRelationship.affinityScore;
      totalCompletion += track.userRelationship.completionRate;
      totalReplay += track.userRelationship.replayRate;
      totalSkip += track.userRelationship.skipRate;

      // Count preferred contexts
      const context = track.patternAnalysis?.preferredContext;
      if (context) {
        patterns.preferredContexts[context] = (patterns.preferredContexts[context] || 0) + 1;
      }

      // Count time patterns
      const timePattern = track.patternAnalysis?.timePattern;
      if (timePattern) {
        patterns.timePatterns[timePattern] = (patterns.timePatterns[timePattern] || 0) + 1;
      }
    });

    patterns.averageAffinityScore = totalAffinity / tracks.length;
    patterns.engagementPatterns.averageCompletionRate = totalCompletion / tracks.length;
    patterns.engagementPatterns.averageReplayRate = totalReplay / tracks.length;
    patterns.engagementPatterns.skipTolerance = 1 - (totalSkip / tracks.length); // Higher = more tolerant

    return patterns;
  }

  // Derive mood preference from audio features
  deriveMoodPreference(audioFeatures) {
    const valence = audioFeatures.valence?.average || 0.5;
    const energy = audioFeatures.energy?.average || 0.5;

    if (valence > 0.7 && energy > 0.6) return 'happy_energetic';
    if (valence > 0.7 && energy < 0.4) return 'happy_calm';
    if (valence < 0.3 && energy > 0.6) return 'sad_energetic';
    if (valence < 0.3 && energy < 0.4) return 'sad_calm';
    if (energy > 0.7) return 'energetic';
    if (energy < 0.3) return 'calm';
    return 'balanced';
  }

  // Derive energy preference
  deriveEnergyPreference(audioFeatures) {
    const energy = audioFeatures.energy?.average || 0.5;
    
    if (energy > 0.8) return 'very_high';
    if (energy > 0.6) return 'high';
    if (energy > 0.4) return 'medium';
    if (energy > 0.2) return 'low';
    return 'very_low';
  }

  // Derive danceability preference
  deriveDanceabilityPreference(audioFeatures) {
    const danceability = audioFeatures.danceability?.average || 0.5;
    
    if (danceability > 0.8) return 'very_danceable';
    if (danceability > 0.6) return 'danceable';
    if (danceability > 0.4) return 'moderate';
    if (danceability > 0.2) return 'low_dance';
    return 'not_danceable';
  }

  // Derive genre affinity from listening history
  deriveGenreAffinity(tracks) {
    // This would typically integrate with genre classification
    // For now, return placeholder
    return {
      primary: 'unknown',
      secondary: [],
      diversity: 0.5
    };
  }

  // Calculate similarity between user profile and a track
  calculateTrackSimilarity(userProfile, trackAudioFeatures, customWeights = null) {
    if (!userProfile || !trackAudioFeatures) return 0;

    const weights = customWeights || userProfile.customWeights || this.featureWeights;
    let totalSimilarity = 0;
    let totalWeight = 0;

    // Compare each audio feature
    Object.keys(weights).forEach(feature => {
      if (feature === 'affinityPattern') return; // Skip non-audio features

      const userValue = userProfile.audioFeatures[feature]?.average;
      const trackValue = trackAudioFeatures[feature];

      if (userValue !== undefined && trackValue !== undefined) {
        // Normalize values and calculate similarity
        let similarity;
        
        if (feature === 'tempo') {
          // Special handling for tempo (BPM)
          const diff = Math.abs(userValue - trackValue);
          similarity = Math.max(0, 1 - (diff / 100)); // Normalize by 100 BPM range
        } else if (feature === 'loudness') {
          // Special handling for loudness (dB)
          const diff = Math.abs(userValue - trackValue);
          similarity = Math.max(0, 1 - (diff / 30)); // Normalize by 30 dB range
        } else {
          // Standard 0-1 features
          const diff = Math.abs(userValue - trackValue);
          similarity = 1 - diff;
        }

        totalSimilarity += similarity * weights[feature];
        totalWeight += weights[feature];
      }
    });

    return totalWeight > 0 ? totalSimilarity / totalWeight : 0;
  }

  // Generate predictions for new tracks
  async predictUserPreference(userId, trackData, customWeights = null) {
    try {
      const userProfile = await this.getUserPersonalizedProfile(userId, customWeights);
      
      if (!userProfile) {
        return {
          prediction: 0.5, // Neutral prediction
          confidence: 0,
          reasoning: 'Insufficient user data for prediction'
        };
      }

      // Calculate audio feature similarity
      const featureSimilarity = this.calculateTrackSimilarity(
        userProfile, 
        trackData.audioFeatures, 
        customWeights
      );

      // Factor in listening patterns
      const patternMatch = this.calculatePatternMatch(userProfile.listeningPatterns, trackData);
      
      // Combine scores with confidence weighting
      const confidence = userProfile.confidence;
      const prediction = (featureSimilarity * 0.7) + (patternMatch * 0.3);
      
      // Adjust prediction based on confidence
      const finalPrediction = (prediction * confidence) + (0.5 * (1 - confidence));

      return {
        prediction: Math.max(0, Math.min(1, finalPrediction)),
        confidence: confidence,
        featureSimilarity,
        patternMatch,
        reasoning: this.generateRecommendationReasoning(userProfile, trackData, featureSimilarity)
      };

    } catch (error) {
      log.error('Failed to predict user preference:', error);
      throw error;
    }
  }

  // Calculate how well a track matches user's listening patterns
  calculatePatternMatch(userPatterns, trackData) {
    // This would analyze factors like:
    // - Time of day the user typically listens to similar music
    // - Context patterns (playlist vs album vs search)
    // - Engagement patterns (do they typically finish songs like this)
    
    // For now, return a baseline score
    return userPatterns.averageAffinityScore || 0.5;
  }

  // Generate human-readable reasoning for recommendations
  generateRecommendationReasoning(userProfile, trackData, similarity) {
    const reasons = [];
    
    if (similarity > this.similarityThresholds.high) {
      reasons.push("Matches your music taste very well");
    } else if (similarity > this.similarityThresholds.medium) {
      reasons.push("Similar to music you enjoy");
    }

    // Add specific feature matches
    const audioFeatures = userProfile.audioFeatures;
    const trackFeatures = trackData.audioFeatures;

    if (audioFeatures.energy && trackFeatures.energy) {
      const energyDiff = Math.abs(audioFeatures.energy.average - trackFeatures.energy);
      if (energyDiff < 0.2) {
        reasons.push(`Matches your preferred energy level (${audioFeatures.energy.preference})`);
      }
    }

    if (audioFeatures.danceability && trackFeatures.danceability) {
      const danceDiff = Math.abs(audioFeatures.danceability.average - trackFeatures.danceability);
      if (danceDiff < 0.2) {
        reasons.push(`Matches your danceability preference`);
      }
    }

    if (audioFeatures.valence && trackFeatures.valence) {
      const valenceDiff = Math.abs(audioFeatures.valence.average - trackFeatures.valence);
      if (valenceDiff < 0.2) {
        reasons.push(`Matches your mood preferences`);
      }
    }

    return reasons.length > 0 ? reasons.join("; ") : "Based on your listening history";
  }

  // Get personalized recommendations from a list of tracks
  async getPersonalizedRecommendations(userId, candidateTracks, customWeights = null, limit = 10) {
    try {
      const predictions = [];

      for (const track of candidateTracks) {
        const prediction = await this.predictUserPreference(userId, track, customWeights);
        
        predictions.push({
          track,
          ...prediction
        });
      }

      // Sort by prediction score and confidence
      predictions.sort((a, b) => {
        const scoreA = a.prediction * a.confidence;
        const scoreB = b.prediction * b.confidence;
        return scoreB - scoreA;
      });

      return predictions.slice(0, limit);

    } catch (error) {
      log.error('Failed to get personalized recommendations:', error);
      throw error;
    }
  }

  // Update user's custom weights based on feedback
  async updateCustomWeights(userId, trackId, feedback, currentWeights = null) {
    try {
      // This is a simplified learning algorithm
      // In practice, you'd want more sophisticated ML here
      
      const userProfile = await this.getUserPersonalizedProfile(userId, currentWeights);
      if (!userProfile) return null;

      // Get the track they provided feedback on
      const trackRelationship = await musicAnalyticsService.model.findOne({
        userId,
        trackId
      });

      if (!trackRelationship) return null;

      // Adjust weights based on feedback
      const newWeights = { ...userProfile.customWeights };
      const trackFeatures = trackRelationship.audioFeatures;
      const userFeatures = userProfile.audioFeatures;

      const learningRate = 0.1; // How fast to adapt

      Object.keys(trackFeatures).forEach(feature => {
        if (newWeights[feature] && userFeatures[feature]) {
          const featureDiff = Math.abs(
            userFeatures[feature].average - trackFeatures[feature]
          );

          if (feedback > 0.5) {
            // Positive feedback - increase weight if features are similar
            if (featureDiff < 0.2) {
              newWeights[feature] += learningRate * (1 - newWeights[feature]);
            }
          } else {
            // Negative feedback - decrease weight if features are similar
            if (featureDiff < 0.2) {
              newWeights[feature] *= (1 - learningRate);
            }
          }
        }
      });

      // Normalize weights to sum to 1
      const totalWeight = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
      Object.keys(newWeights).forEach(feature => {
        newWeights[feature] /= totalWeight;
      });

      log.info(`Updated custom weights for user ${userId}`, { newWeights });
      return newWeights;

    } catch (error) {
      log.error('Failed to update custom weights:', error);
      throw error;
    }
  }
}

export default new MusicPredictionService();