import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import musicAnalyticsService from '../services/musicAnalyticsService.js';
import musicPredictionService from '../services/musicPredictionService.js';
import spotifyService from '../services/spotifyService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get user's current music prediction settings
router.get('/settings', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('musicProfile.musicPersonality.predictionSettings musicProfile.musicPersonality.derivedPreferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const settings = user.musicProfile?.musicPersonality?.predictionSettings || {};
    const derived = user.musicProfile?.musicPersonality?.derivedPreferences || {};

    res.json({
      success: true,
      data: {
        customWeights: settings.customWeights || {},
        featureRanges: settings.featureRanges || {},
        adaptiveLearning: settings.adaptiveLearning !== false,
        explorationFactor: settings.explorationFactor || 0.2,
        diversityBoost: settings.diversityBoost || 0.1,
        feedbackSensitivity: settings.feedbackSensitivity || 0.1,
        derivedPreferences: derived,
        totalFeedbackReceived: settings.totalFeedbackReceived || 0
      }
    });

  } catch (error) {
    log.error('Get music preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get music preferences'
    });
  }
});

// Update user's custom weights for audio features
router.put('/weights', protect, async (req, res) => {
  try {
    const { weights } = req.body;
    
    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid weights object'
      });
    }

    // Validate weight values
    const validFeatures = ['danceability', 'energy', 'valence', 'tempo', 'speechiness', 
                          'acousticness', 'instrumentalness', 'liveness', 'loudness', 'affinityPattern'];
    
    const invalidFeatures = Object.keys(weights).filter(key => !validFeatures.includes(key));
    if (invalidFeatures.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid features: ${invalidFeatures.join(', ')}`
      });
    }

    // Validate weight ranges (0-1)
    for (const [feature, weight] of Object.entries(weights)) {
      if (typeof weight !== 'number' || weight < 0 || weight > 1) {
        return res.status(400).json({
          success: false,
          error: `Weight for ${feature} must be between 0 and 1`
        });
      }
    }

    // Normalize weights to sum to 1
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) {
      return res.status(400).json({
        success: false,
        error: 'Total weights cannot be zero'
      });
    }

    const normalizedWeights = {};
    Object.keys(weights).forEach(feature => {
      normalizedWeights[feature] = weights[feature] / totalWeight;
    });

    // Update user's custom weights
    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        'musicProfile.musicPersonality.predictionSettings.customWeights': normalizedWeights,
        'musicProfile.musicPersonality.predictionSettings.lastWeightUpdate': new Date()
      }
    });

    log.info('Updated custom weights for user', { 
      userId: req.user.id, 
      weights: normalizedWeights 
    });

    res.json({
      success: true,
      data: {
        customWeights: normalizedWeights,
        message: 'Custom weights updated successfully'
      }
    });

  } catch (error) {
    log.error('Update custom weights error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update custom weights'
    });
  }
});

// Set preferred ranges for audio features
router.put('/ranges', protect, async (req, res) => {
  try {
    const { ranges } = req.body;
    
    if (!ranges || typeof ranges !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid ranges object'
      });
    }

    // Validate ranges
    const validFeatures = ['danceability', 'energy', 'valence', 'tempo'];
    
    for (const [feature, range] of Object.entries(ranges)) {
      if (!validFeatures.includes(feature)) {
        return res.status(400).json({
          success: false,
          error: `Invalid feature: ${feature}`
        });
      }

      if (!range.min || !range.max || range.min >= range.max) {
        return res.status(400).json({
          success: false,
          error: `Invalid range for ${feature}: min must be less than max`
        });
      }

      // Validate range values based on feature type
      if (feature === 'tempo') {
        if (range.min < 40 || range.max > 200) {
          return res.status(400).json({
            success: false,
            error: 'Tempo range must be between 40 and 200 BPM'
          });
        }
      } else {
        if (range.min < 0 || range.max > 1) {
          return res.status(400).json({
            success: false,
            error: `${feature} range must be between 0 and 1`
          });
        }
      }
    }

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        'musicProfile.musicPersonality.predictionSettings.featureRanges': ranges
      }
    });

    log.info('Updated feature ranges for user', { 
      userId: req.user.id, 
      ranges 
    });

    res.json({
      success: true,
      data: {
        featureRanges: ranges,
        message: 'Feature ranges updated successfully'
      }
    });

  } catch (error) {
    log.error('Update feature ranges error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feature ranges'
    });
  }
});

// Update prediction preferences
router.put('/preferences', protect, async (req, res) => {
  try {
    const { 
      adaptiveLearning = true,
      explorationFactor = 0.2,
      diversityBoost = 0.1,
      feedbackSensitivity = 0.1
    } = req.body;

    // Validate values
    if (typeof adaptiveLearning !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'adaptiveLearning must be a boolean'
      });
    }

    if (explorationFactor < 0 || explorationFactor > 1) {
      return res.status(400).json({
        success: false,
        error: 'explorationFactor must be between 0 and 1'
      });
    }

    if (diversityBoost < 0 || diversityBoost > 0.5) {
      return res.status(400).json({
        success: false,
        error: 'diversityBoost must be between 0 and 0.5'
      });
    }

    if (feedbackSensitivity < 0.01 || feedbackSensitivity > 0.5) {
      return res.status(400).json({
        success: false,
        error: 'feedbackSensitivity must be between 0.01 and 0.5'
      });
    }

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        'musicProfile.musicPersonality.predictionSettings.adaptiveLearning': adaptiveLearning,
        'musicProfile.musicPersonality.predictionSettings.explorationFactor': explorationFactor,
        'musicProfile.musicPersonality.predictionSettings.diversityBoost': diversityBoost,
        'musicProfile.musicPersonality.predictionSettings.feedbackSensitivity': feedbackSensitivity
      }
    });

    res.json({
      success: true,
      data: {
        adaptiveLearning,
        explorationFactor,
        diversityBoost,
        feedbackSensitivity,
        message: 'Prediction preferences updated successfully'
      }
    });

  } catch (error) {
    log.error('Update prediction preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update prediction preferences'
    });
  }
});

// Get user's personalized profile and predictions
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get personalized profile
    const customWeights = user.musicProfile?.musicPersonality?.predictionSettings?.customWeights;
    const profile = await musicPredictionService.getUserPersonalizedProfile(req.user.id, customWeights);

    if (!profile) {
      return res.json({
        success: true,
        data: {
          message: 'Not enough listening data to generate profile',
          confidence: 0,
          suggestions: [
            'Connect your Spotify account',
            'Listen to more music to build your profile',
            'Rate some songs to improve recommendations'
          ]
        }
      });
    }

    res.json({
      success: true,
      data: profile
    });

  } catch (error) {
    log.error('Get personalized profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get personalized profile'
    });
  }
});

// Provide feedback on a recommendation
router.post('/feedback', protect, async (req, res) => {
  try {
    const { trackId, rating, feedback } = req.body;
    
    if (!trackId) {
      return res.status(400).json({
        success: false,
        error: 'Track ID is required'
      });
    }

    if (rating === undefined || rating < 0 || rating > 1) {
      return res.status(400).json({
        success: false,
        error: 'Rating must be between 0 and 1'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Record feedback and update listening relationship
    await musicAnalyticsService.recordListeningEvent(req.user.id, {
      id: trackId,
      name: feedback?.trackName || 'Unknown',
      artist: feedback?.artistName || 'Unknown',
      album: feedback?.albumName || 'Unknown'
    }, {
      type: 'feedback',
      wasCompleted: rating > 0.7,
      wasSkipped: rating < 0.3,
      sessionLength: feedback?.sessionLength || 0
    });

    // Update custom weights based on feedback if adaptive learning is enabled
    const adaptiveLearning = user.musicProfile?.musicPersonality?.predictionSettings?.adaptiveLearning;
    let updatedWeights = null;

    if (adaptiveLearning !== false) {
      const currentWeights = user.musicProfile?.musicPersonality?.predictionSettings?.customWeights;
      updatedWeights = await musicPredictionService.updateCustomWeights(
        req.user.id, 
        trackId, 
        rating, 
        currentWeights
      );

      if (updatedWeights) {
        await User.findByIdAndUpdate(req.user.id, {
          $set: {
            'musicProfile.musicPersonality.predictionSettings.customWeights': updatedWeights,
            'musicProfile.musicPersonality.predictionSettings.lastWeightUpdate': new Date()
          },
          $inc: {
            'musicProfile.musicPersonality.predictionSettings.totalFeedbackReceived': 1
          }
        });
      }
    }

    log.info('Recorded music feedback', { 
      userId: req.user.id, 
      trackId, 
      rating,
      adaptiveLearning,
      weightsUpdated: !!updatedWeights
    });

    res.json({
      success: true,
      data: {
        message: 'Feedback recorded successfully',
        adaptiveLearning,
        weightsUpdated: !!updatedWeights,
        newWeights: updatedWeights
      }
    });

  } catch (error) {
    log.error('Record feedback error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record feedback'
    });
  }
});

// Discover new songs using YOUR smart algorithm (not Spotify's recommendations)
router.post('/discover', protect, async (req, res) => {
  try {
    const { 
      limit = 20,
      strategy = 'custom_prediction', // Default to YOUR algorithm
      useSpotifyRecs = false, // Explicitly opt-in to Spotify (not recommended)
      searchQueries = [],
      seedGenres = [],
      includeScores = false // Scores are optional visual aid
    } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.musicProfile?.spotify?.connected) {
      return res.status(400).json({
        success: false,
        error: 'Spotify account not connected. Please connect Spotify to discover music.'
      });
    }

    // Import the smart discovery service
    const { default: smartMusicDiscoveryService } = await import('../services/smartMusicDiscoveryService.js');

    // Discover actual songs using YOUR algorithm
    const discovery = await smartMusicDiscoveryService.discoverSongsForUser(req.user.id, {
      limit,
      strategy,
      useSpotifyRecs, // Usually false - Spotify's recs suck
      searchQueries,
      seedGenres,
      includeScores
    });

    // Log warning if user is using Spotify's recommendations
    if (useSpotifyRecs) {
      log.warn(`User ${req.user.id} is using Spotify recommendations fallback - consider custom prediction instead`);
    }

    res.json({
      success: true,
      data: {
        // Main event: actual songs
        songs: discovery.songs,
        
        // Context
        strategy: discovery.strategy,
        totalFound: discovery.songs.length,
        timestamp: discovery.timestamp,
        
        // Warnings
        usingSpotifyFallback: useSpotifyRecs,
        warning: useSpotifyRecs ? 'Using Spotify recommendations - consider using custom prediction for better results' : null
      }
    });

  } catch (error) {
    log.error('Music discovery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover music',
      details: error.message
    });
  }
});

// Legacy endpoint for ranking candidate tracks (still useful for user-provided lists)
router.post('/rank-tracks', protect, async (req, res) => {
  try {
    const { candidateTracks = [], includeScores = false } = req.body;
    
    if (!Array.isArray(candidateTracks) || candidateTracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Candidate tracks array is required'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get user's custom weights
    const customWeights = user.musicProfile?.musicPersonality?.predictionSettings?.customWeights;
    
    // Enhance candidate tracks with audio features if not already included
    const enhancedTracks = [];
    
    for (const track of candidateTracks) {
      if (!track.audioFeatures && track.id && user.musicProfile?.spotify?.accessToken) {
        try {
          const audioFeatures = await spotifyService.getAudioFeatures(
            user.musicProfile.spotify.accessToken, 
            track.id
          );
          enhancedTracks.push({
            ...track,
            audioFeatures
          });
        } catch (error) {
          log.warn(`Failed to get audio features for track ${track.id}:`, error);
          enhancedTracks.push(track);
        }
      } else {
        enhancedTracks.push(track);
      }
    }

    // Rank using YOUR algorithm
    const rankedTracks = [];
    
    for (const track of enhancedTracks) {
      if (!track.audioFeatures) continue;

      try {
        const prediction = await musicPredictionService.predictUserPreference(
          req.user.id,
          track,
          customWeights
        );

        const rankedTrack = {
          // Main song data
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          imageUrl: track.imageUrl,
          spotifyUrl: track.spotifyUrl,
          previewUrl: track.previewUrl
        };

        // Optional scores
        if (includeScores) {
          rankedTrack.predictionScore = prediction.prediction;
          rankedTrack.confidence = prediction.confidence;
          rankedTrack.reasoning = prediction.reasoning;
        }

        rankedTracks.push(rankedTrack);

      } catch (error) {
        log.warn(`Failed to rank track ${track.id}:`, error);
        // Include without scores
        rankedTracks.push({
          id: track.id,
          name: track.name,
          artist: track.artist,
          album: track.album,
          imageUrl: track.imageUrl,
          spotifyUrl: track.spotifyUrl,
          previewUrl: track.previewUrl
        });
      }
    }

    // Sort by prediction score
    rankedTracks.sort((a, b) => (b.predictionScore || 0.5) - (a.predictionScore || 0.5));

    res.json({
      success: true,
      data: {
        tracks: rankedTracks,
        totalRanked: rankedTracks.length,
        customWeightsUsed: !!customWeights,
        includesScores: includeScores
      }
    });

  } catch (error) {
    log.error('Track ranking error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rank tracks'
    });
  }
});

// Reset user preferences to defaults
router.post('/reset', protect, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $unset: {
        'musicProfile.musicPersonality.predictionSettings': 1,
        'musicProfile.musicPersonality.derivedPreferences': 1
      }
    });

    log.info('Reset music preferences for user', { userId: req.user.id });

    res.json({
      success: true,
      data: {
        message: 'Music preferences reset to defaults'
      }
    });

  } catch (error) {
    log.error('Reset preferences error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset preferences'
    });
  }
});

export default router;