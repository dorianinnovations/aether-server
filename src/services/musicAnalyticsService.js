import mongoose from 'mongoose';
import { log } from '../utils/logger.js';
import spotifyService from './spotifyService.js';

// User-Song Relationship Tracking Schema
const UserSongRelationshipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  trackId: {
    type: String,
    required: true,
    index: true
  },
  trackName: String,
  artistName: String,
  albumName: String,
  
  // Audio Features from Spotify
  audioFeatures: {
    danceability: { type: Number, min: 0, max: 1 },
    energy: { type: Number, min: 0, max: 1 },
    valence: { type: Number, min: 0, max: 1 },       // musical positivity/happiness
    tempo: Number,
    speechiness: { type: Number, min: 0, max: 1 },
    acousticness: { type: Number, min: 0, max: 1 },
    instrumentalness: { type: Number, min: 0, max: 1 },
    liveness: { type: Number, min: 0, max: 1 },
    loudness: Number,
    key: Number,
    mode: Number,
    timeSignature: Number
  },
  
  // User's Relationship with this Song
  userRelationship: {
    // Play patterns
    totalPlays: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 1 }, // how often they finish the song
    skipRate: { type: Number, default: 0, min: 0, max: 1 },      // how often they skip
    replayRate: { type: Number, default: 0, min: 0, max: 1 },    // how often they replay
    
    // Listening context
    listeningContexts: [{
      context: {
        type: String,
        enum: ['playlist', 'album', 'artist', 'search', 'recommendation', 'radio', 'liked_songs']
      },
      timestamp: { type: Date, default: Date.now },
      sessionLength: Number, // how long they listened in this session (ms)
      wasSkipped: { type: Boolean, default: false },
      wasCompleted: { type: Boolean, default: false },
      wasReplayed: { type: Boolean, default: false }
    }],
    
    // Time-based patterns
    listeningTimes: [{
      hour: { type: Number, min: 0, max: 23 },
      dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 = Sunday
      count: { type: Number, default: 1 }
    }],
    
    // Engagement metrics
    averageListeningSession: Number, // average ms listened per play
    firstHeard: { type: Date, default: Date.now },
    lastHeard: Date,
    
    // User preference signals
    explicit_feedback: {
      liked: Boolean,     // if user explicitly liked/saved
      disliked: Boolean,  // if user explicitly disliked/blocked
      rating: { type: Number, min: 1, max: 5 } // if user rated the song
    },
    
    // Derived metrics
    affinityScore: { type: Number, default: 0, min: 0, max: 1 }, // calculated affinity
    discoverySource: {
      type: String,
      enum: ['organic', 'recommendation', 'friend', 'playlist', 'search', 'social']
    }
  },
  
  // Pattern analysis
  patternAnalysis: {
    // Listening behavior patterns
    isGrowing: Boolean,        // listening frequency increasing
    isStable: Boolean,         // consistent listening pattern
    isFading: Boolean,         // listening frequency decreasing
    
    // Context patterns
    preferredContext: String,   // most common listening context
    timePattern: String,        // when they usually listen (morning, evening, etc.)
    
    // Mood correlation (if we can derive it)
    moodCorrelation: {
      happy: Number,
      sad: Number,
      energetic: Number,
      calm: Number,
      focused: Number
    }
  },
  
  // Metadata
  lastUpdated: { type: Date, default: Date.now },
  version: { type: String, default: '1.0' }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
UserSongRelationshipSchema.index({ userId: 1, trackId: 1 }, { unique: true });
UserSongRelationshipSchema.index({ userId: 1, 'userRelationship.affinityScore': -1 });
UserSongRelationshipSchema.index({ 'audioFeatures.danceability': 1, 'audioFeatures.energy': 1 });

const UserSongRelationship = mongoose.model('UserSongRelationship', UserSongRelationshipSchema);

class MusicAnalyticsService {
  constructor() {
    this.model = UserSongRelationship;
  }

  // Record a listening event
  async recordListeningEvent(userId, trackData, context = {}) {
    try {
      const {
        id: trackId,
        name: trackName,
        artist: artistName,
        album: albumName,
        audioFeatures
      } = trackData;

      if (!trackId) {
        log.warn('Cannot record listening event without track ID');
        return null;
      }

      // Find or create relationship record
      let relationship = await this.model.findOne({ userId, trackId });
      
      if (!relationship) {
        relationship = new this.model({
          userId,
          trackId,
          trackName,
          artistName,
          albumName,
          audioFeatures: audioFeatures || {},
          userRelationship: {
            totalPlays: 0,
            completionRate: 0,
            skipRate: 0,
            replayRate: 0,
            listeningContexts: [],
            listeningTimes: [],
            firstHeard: new Date()
          },
          patternAnalysis: {}
        });
      }

      // Update listening data
      relationship.userRelationship.totalPlays += 1;
      relationship.userRelationship.lastHeard = new Date();

      // Add context data
      const now = new Date();
      const contextEntry = {
        context: context.type || 'unknown',
        timestamp: now,
        sessionLength: context.sessionLength || 0,
        wasSkipped: context.wasSkipped || false,
        wasCompleted: context.wasCompleted || false,
        wasReplayed: context.wasReplayed || false
      };

      relationship.userRelationship.listeningContexts.push(contextEntry);

      // Update time-based patterns
      const hour = now.getHours();
      const dayOfWeek = now.getDay();
      
      let timeEntry = relationship.userRelationship.listeningTimes.find(
        t => t.hour === hour && t.dayOfWeek === dayOfWeek
      );
      
      if (timeEntry) {
        timeEntry.count += 1;
      } else {
        relationship.userRelationship.listeningTimes.push({
          hour,
          dayOfWeek,
          count: 1
        });
      }

      // Recalculate metrics
      await this.updateCalculatedMetrics(relationship);

      await relationship.save();
      
      log.debug(`Recorded listening event for user ${userId}, track ${trackId}`);
      return relationship;

    } catch (error) {
      log.error('Failed to record listening event:', error);
      throw error;
    }
  }

  // Update calculated metrics based on listening history
  async updateCalculatedMetrics(relationship) {
    const contexts = relationship.userRelationship.listeningContexts;
    const totalPlays = contexts.length;

    if (totalPlays === 0) return;

    // Calculate completion and skip rates
    const completed = contexts.filter(c => c.wasCompleted).length;
    const skipped = contexts.filter(c => c.wasSkipped).length;
    const replayed = contexts.filter(c => c.wasReplayed).length;

    relationship.userRelationship.completionRate = completed / totalPlays;
    relationship.userRelationship.skipRate = skipped / totalPlays;
    relationship.userRelationship.replayRate = replayed / totalPlays;

    // Calculate average session length
    const validSessions = contexts.filter(c => c.sessionLength > 0);
    if (validSessions.length > 0) {
      relationship.userRelationship.averageListeningSession = 
        validSessions.reduce((sum, c) => sum + c.sessionLength, 0) / validSessions.length;
    }

    // Calculate affinity score (0-1)
    // Factors: completion rate, replay rate, recency, frequency
    const completionWeight = 0.3;
    const replayWeight = 0.3;
    const frequencyWeight = 0.2;
    const recencyWeight = 0.2;

    const daysSinceLastHeard = (Date.now() - relationship.userRelationship.lastHeard) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSinceLastHeard / 30)); // Decay over 30 days
    
    const daysSinceFirst = (Date.now() - relationship.userRelationship.firstHeard) / (1000 * 60 * 60 * 24);
    const frequencyScore = Math.min(1, totalPlays / Math.max(1, daysSinceFirst / 7)); // Plays per week, capped at 1

    relationship.userRelationship.affinityScore = Math.min(1,
      (relationship.userRelationship.completionRate * completionWeight) +
      (relationship.userRelationship.replayRate * replayWeight) +
      (frequencyScore * frequencyWeight) +
      (recencyScore * recencyWeight)
    );

    // Update pattern analysis
    relationship.patternAnalysis.preferredContext = this.getMostCommonContext(contexts);
    relationship.patternAnalysis.timePattern = this.getTimePattern(relationship.userRelationship.listeningTimes);
    
    // Analyze listening trend
    const recentPlays = contexts.filter(c => 
      (Date.now() - c.timestamp) < (7 * 24 * 60 * 60 * 1000) // Last 7 days
    ).length;
    const olderPlays = contexts.filter(c => 
      (Date.now() - c.timestamp) >= (7 * 24 * 60 * 60 * 1000) &&
      (Date.now() - c.timestamp) < (14 * 24 * 60 * 60 * 1000) // Previous 7 days
    ).length;

    if (recentPlays > olderPlays * 1.2) {
      relationship.patternAnalysis.isGrowing = true;
      relationship.patternAnalysis.isStable = false;
      relationship.patternAnalysis.isFading = false;
    } else if (recentPlays < olderPlays * 0.8) {
      relationship.patternAnalysis.isGrowing = false;
      relationship.patternAnalysis.isStable = false;
      relationship.patternAnalysis.isFading = true;
    } else {
      relationship.patternAnalysis.isGrowing = false;
      relationship.patternAnalysis.isStable = true;
      relationship.patternAnalysis.isFading = false;
    }

    relationship.lastUpdated = new Date();
  }

  // Get most common listening context
  getMostCommonContext(contexts) {
    const contextCounts = {};
    contexts.forEach(c => {
      contextCounts[c.context] = (contextCounts[c.context] || 0) + 1;
    });
    
    return Object.keys(contextCounts).reduce((a, b) => 
      contextCounts[a] > contextCounts[b] ? a : b, 'unknown'
    );
  }

  // Analyze time patterns
  getTimePattern(listeningTimes) {
    const hourCounts = Array(24).fill(0);
    
    listeningTimes.forEach(t => {
      hourCounts[t.hour] += t.count;
    });

    const maxCount = Math.max(...hourCounts);
    const peakHour = hourCounts.indexOf(maxCount);

    if (peakHour >= 6 && peakHour < 12) return 'morning';
    if (peakHour >= 12 && peakHour < 17) return 'afternoon';
    if (peakHour >= 17 && peakHour < 22) return 'evening';
    return 'night';
  }

  // Get user's track relationships with high affinity
  async getUserTopTracks(userId, limit = 50) {
    try {
      return await this.model.find({ userId })
        .sort({ 'userRelationship.affinityScore': -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      log.error('Failed to get user top tracks:', error);
      return [];
    }
  }

  // Get user's audio feature preferences
  async getUserAudioFeatureProfile(userId) {
    try {
      const topTracks = await this.getUserTopTracks(userId, 100);
      
      if (topTracks.length === 0) {
        return null;
      }

      // Calculate weighted averages based on affinity scores
      const features = ['danceability', 'energy', 'valence', 'tempo', 'speechiness', 
                       'acousticness', 'instrumentalness', 'liveness', 'loudness'];
      
      const profile = {};
      let totalWeight = 0;

      features.forEach(feature => {
        let weightedSum = 0;
        let validTracks = 0;

        topTracks.forEach(track => {
          if (track.audioFeatures && track.audioFeatures[feature] !== undefined) {
            const weight = track.userRelationship.affinityScore;
            weightedSum += track.audioFeatures[feature] * weight;
            totalWeight += weight;
            validTracks++;
          }
        });

        if (validTracks > 0) {
          profile[feature] = {
            average: weightedSum / totalWeight,
            preference: this.categorizePreference(weightedSum / totalWeight, feature)
          };
        }
      });

      return {
        userId,
        profile,
        basedOnTracks: topTracks.length,
        confidence: Math.min(1, topTracks.length / 50), // Confidence increases with more data
        lastUpdated: new Date()
      };

    } catch (error) {
      log.error('Failed to get user audio feature profile:', error);
      return null;
    }
  }

  // Categorize preference levels for features
  categorizePreference(value, feature) {
    // Different features have different meaningful ranges
    switch (feature) {
      case 'danceability':
      case 'energy':
      case 'valence':
        if (value > 0.7) return 'high';
        if (value > 0.3) return 'medium';
        return 'low';
      
      case 'tempo':
        if (value > 140) return 'fast';
        if (value > 90) return 'medium';
        return 'slow';
      
      default:
        if (value > 0.6) return 'high';
        if (value > 0.4) return 'medium';
        return 'low';
    }
  }

  // Clean up old listening contexts to prevent bloat
  async cleanupOldData(daysToKeep = 90) {
    try {
      const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
      
      const result = await this.model.updateMany(
        {},
        {
          $pull: {
            'userRelationship.listeningContexts': {
              timestamp: { $lt: cutoffDate }
            }
          }
        }
      );

      log.info(`Cleaned up listening contexts older than ${daysToKeep} days:`, result);
      return result;

    } catch (error) {
      log.error('Failed to cleanup old listening data:', error);
      throw error;
    }
  }
}

export default new MusicAnalyticsService();