import mongoose from 'mongoose';
import UserAnalytics from '../models/UserAnalytics.js';
import ragMemoryService from './ragMemoryService.js';

class UserAnalyticsService {
  constructor() {
    this.analyticsPeriods = ['daily', 'weekly', 'monthly', 'yearly', 'all_time'];
  }

  /**
   * Get user analytics overview
   */
  async getUserAnalyticsOverview(userId, period = 'all_time') {
    try {
      console.log(`📊 Getting analytics overview for user ${userId}, period: ${period}`);

      let analytics = await UserAnalytics.findOne({ userId, period });
      
      if (!analytics || analytics.needsUpdate()) {
        console.log(`🔄 Analytics for ${period} needs updating, calculating...`);
        analytics = await this.calculateUserAnalytics(userId, period);
      }

      const summary = analytics.getSummaryStats();
      
      return {
        period,
        dateRange: analytics.dateRange,
        summary,
        detailed: {
          artistEngagement: analytics.artistEngagement,
          contentConsumption: analytics.contentConsumption,
          discovery: analytics.discovery,
          listeningBehavior: analytics.listeningBehavior,
          engagement: analytics.engagement
        },
        insights: analytics.insights,
        lastUpdated: analytics.metadata.calculatedAt
      };

    } catch (error) {
      console.error('Error getting user analytics overview:', error);
      throw new Error(`Failed to get analytics overview: ${error.message}`);
    }
  }

  /**
   * Track user interaction with artist content
   */
  async trackInteraction(userId, artistId, interactionType, metadata = {}) {
    try {
      console.log(`📈 Tracking ${interactionType} interaction for user ${userId} with artist ${artistId}`);

      // Update real-time analytics
      await this.updateRealTimeAnalytics(userId, {
        type: 'interaction',
        artistId,
        interactionType,
        metadata,
        timestamp: new Date()
      });

      // Store in user memory for personalization
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      const artistName = user?.artistPreferences?.followedArtists?.find(
        follow => follow.artistId === artistId
      )?.artistName || 'Unknown Artist';

      await ragMemoryService.storeMemory(userId, {
        type: 'engagement',
        content: `User ${interactionType} content from ${artistName}`,
        importance: this.getInteractionImportance(interactionType),
        metadata: {
          artist: artistName,
          artistId,
          interaction: interactionType,
          ...metadata
        }
      });

      return { success: true };

    } catch (error) {
      console.error('Error tracking interaction:', error);
      throw error;
    }
  }

  /**
   * Get detailed artist listening analytics
   */
  async getArtistAnalytics(userId, options = {}) {
    try {
      const { period = 'all_time', limit = 20 } = options;

      console.log(`🎤 Getting artist analytics for user ${userId}`);

      const analytics = await UserAnalytics.findOne({ userId, period });
      if (!analytics) {
        return {
          topArtists: [],
          newDiscoveries: [],
          unfollowed: [],
          totalArtistsFollowed: 0
        };
      }

      const artistEngagement = analytics.artistEngagement;

      return {
        totalArtistsFollowed: artistEngagement.totalArtistsFollowed,
        artistsByPriority: artistEngagement.artistsByPriority,
        topArtists: artistEngagement.topArtists.slice(0, limit),
        newDiscoveries: artistEngagement.newDiscoveries.slice(0, limit),
        unfollowed: artistEngagement.unfollowed.slice(0, 10),
        period: analytics.dateRange
      };

    } catch (error) {
      console.error('Error getting artist analytics:', error);
      throw error;
    }
  }

  /**
   * Get music discovery analytics
   */
  async getDiscoveryAnalytics(userId, period = 'all_time') {
    try {
      console.log(`🔍 Getting discovery analytics for user ${userId}`);

      const analytics = await UserAnalytics.findOne({ userId, period });
      if (!analytics) {
        return {
          patterns: {
            discoveriesThisPeriod: 0,
            discoveryStreak: 0,
            averageTimeBetweenDiscoveries: 0
          },
          recommendations: {
            totalReceived: 0,
            totalAccepted: 0,
            acceptanceRate: 0
          }
        };
      }

      return {
        patterns: analytics.discovery.patterns,
        recommendations: analytics.discovery.recommendations,
        genreExploration: analytics.discovery.patterns.genreExploration,
        period: analytics.dateRange
      };

    } catch (error) {
      console.error('Error getting discovery analytics:', error);
      throw error;
    }
  }

  /**
   * Get listening behavior analytics
   */
  async getListeningAnalytics(userId, period = 'all_time') {
    try {
      console.log(`🎧 Getting listening analytics for user ${userId}`);

      const analytics = await UserAnalytics.findOne({ userId, period });
      if (!analytics) {
        return {
          sessions: { totalSessions: 0, averageSessionLength: 0 },
          consumption: { totalTracksPlayed: 0, totalListeningTime: 0 }
        };
      }

      return {
        sessions: analytics.listeningBehavior.sessions,
        consumption: analytics.listeningBehavior.consumption,
        weeklyPatterns: analytics.listeningBehavior.sessions.weeklyPatterns,
        audioFeatures: analytics.listeningBehavior.consumption.spotifyMetrics?.audioFeatures,
        period: analytics.dateRange
      };

    } catch (error) {
      console.error('Error getting listening analytics:', error);
      throw error;
    }
  }

  /**
   * Get engagement quality metrics
   */
  async getEngagementAnalytics(userId, period = 'all_time') {
    try {
      console.log(`💬 Getting engagement analytics for user ${userId}`);

      const analytics = await UserAnalytics.findOne({ userId, period });
      if (!analytics) {
        return {
          health: { overallEngagementRate: 0, contentSatisfactionScore: 0.5 },
          deepEngagement: { sharesToFriends: 0, commentsLeft: 0 }
        };
      }

      return {
        health: analytics.engagement.health,
        deepEngagement: analytics.engagement.deepEngagement,
        comparisons: analytics.comparisons,
        period: analytics.dateRange
      };

    } catch (error) {
      console.error('Error getting engagement analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate and store comprehensive user analytics
   */
  async calculateUserAnalytics(userId, period = 'all_time') {
    try {
      console.log(`🧮 Calculating ${period} analytics for user ${userId}`);

      const dateRange = this.calculateDateRange(period);
      
      // Get user data
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Calculate all analytics sections
      const [
        artistEngagement,
        contentConsumption,
        discovery,
        listeningBehavior,
        engagement,
        comparisons,
        insights
      ] = await Promise.all([
        this.calculateArtistEngagement(userId, dateRange),
        this.calculateContentConsumption(userId, dateRange),
        this.calculateDiscoveryAnalytics(userId, dateRange),
        this.calculateListeningBehavior(userId, dateRange),
        this.calculateEngagementMetrics(userId, dateRange),
        this.calculateComparisons(userId, period),
        this.generateInsights(userId, dateRange)
      ]);

      // Create or update analytics record
      const analyticsData = {
        userId,
        period,
        dateRange,
        artistEngagement,
        contentConsumption,
        discovery,
        listeningBehavior,
        engagement,
        comparisons,
        insights,
        metadata: {
          calculatedAt: new Date(),
          dataSources: {
            spotify: !!user.musicProfile?.spotify?.connected,
            inAppBehavior: true,
            friendData: false,
            externalSources: false
          },
          dataQuality: {
            completeness: this.calculateDataCompleteness(user),
            freshness: this.calculateDataFreshness(user),
            accuracy: 0.9
          },
          processingTime: Date.now(),
          version: '1.0'
        }
      };

      // Calculate processing time
      analyticsData.metadata.processingTime = Date.now() - analyticsData.metadata.processingTime;

      const analytics = await UserAnalytics.findOneAndUpdate(
        { userId, period },
        analyticsData,
        { upsert: true, new: true }
      );

      console.log(`✅ Calculated and stored ${period} analytics for user ${userId}`);
      return analytics;

    } catch (error) {
      console.error('Error calculating user analytics:', error);
      throw error;
    }
  }

  /**
   * Export user analytics data
   */
  async exportUserAnalytics(userId, format = 'json') {
    try {
      console.log(`📤 Exporting analytics for user ${userId} in ${format} format`);

      // Get all analytics periods
      const allAnalytics = await UserAnalytics.find({ userId }).lean();
      
      // Get additional user data
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId).lean();

      const exportData = {
        userId,
        exportedAt: new Date(),
        userData: {
          username: user?.username,
          joinedAt: user?.createdAt,
          artistsFollowed: user?.artistPreferences?.followedArtists?.length || 0
        },
        analytics: allAnalytics,
        summary: {
          totalArtistsFollowed: this.getTotalArtistsFollowed(allAnalytics),
          totalEngagements: this.getTotalEngagements(allAnalytics),
          discoveryCount: this.getTotalDiscoveries(allAnalytics),
          avgEngagementRate: this.getAverageEngagementRate(allAnalytics)
        }
      };

      if (format === 'csv') {
        return this.convertToCSV(exportData);
      }

      return exportData;

    } catch (error) {
      console.error('Error exporting user analytics:', error);
      throw error;
    }
  }

  /**
   * Private calculation methods
   */

  async calculateArtistEngagement(userId, dateRange) {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    const followedArtists = user?.artistPreferences?.followedArtists || [];
    
    const artistsByPriority = {
      high: followedArtists.filter(a => a.priority === 'high').length,
      medium: followedArtists.filter(a => a.priority === 'medium').length,
      low: followedArtists.filter(a => a.priority === 'low').length
    };

    return {
      totalArtistsFollowed: followedArtists.length,
      artistsByPriority,
      topArtists: [],
      newDiscoveries: [],
      unfollowed: []
    };
  }

  async calculateContentConsumption(userId, dateRange) {
    return {
      totalUpdatesReceived: 0,
      totalUpdatesViewed: 0,
      byContentType: {},
      dailyActivity: [],
      preferenceSignals: {
        preferredContentTypes: [],
        averageEngagementTime: 0
      }
    };
  }

  async calculateDiscoveryAnalytics(userId, dateRange) {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    const followedArtists = user?.artistPreferences?.followedArtists || [];
    const newDiscoveries = followedArtists.filter(follow => {
      const followDate = new Date(follow.followedAt);
      return followDate >= dateRange.start && followDate <= dateRange.end;
    });

    return {
      recommendations: {
        totalReceived: 0, // Would need to track recommendations
        totalAccepted: newDiscoveries.length,
        acceptanceRate: 0
      },
      patterns: {
        discoveriesThisPeriod: newDiscoveries.length,
        discoveryStreak: 0, // Would need streak calculation
        averageTimeBetweenDiscoveries: 0,
        genreExploration: {
          newGenresExplored: [],
          genreDiversityScore: 0.5,
          expandingTaste: true
        }
      }
    };
  }

  async calculateListeningBehavior(userId, dateRange) {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(userId);
    
    const spotifyData = user?.musicProfile?.spotify;
    
    return {
      sessions: {
        totalSessions: 0,
        averageSessionLength: 0,
        longestSession: 0,
        preferredSessionTimes: [],
        weeklyPatterns: {
          mostActiveDay: 'unknown',
          leastActiveDay: 'unknown',
          weekendVsWeekday: { weekend: 0, weekday: 0 }
        }
      },
      consumption: {
        totalTracksPlayed: 0,
        totalListeningTime: 0,
        averageTrackCompletion: 0.8,
        skipRate: 0.2,
        repeatRate: 0.3,
        spotifyMetrics: {
          topTracks: spotifyData?.topTracks?.map(t => t.name) || [],
          topArtists: spotifyData?.recentTracks?.map(t => t.artist) || [],
          topGenres: [],
          audioFeatures: {
            averageDanceability: 0.6,
            averageEnergy: 0.7,
            averageValence: 0.5,
            averageTempo: 120
          }
        }
      }
    };
  }

  async calculateEngagementMetrics(userId, dateRange) {
    return {
      health: {
        overallEngagementRate: 0,
        contentSatisfactionScore: 0,
        platformStickiness: 0,
        churnRisk: 'low'
      },
      deepEngagement: {
        sharesToFriends: 0,
        commentsLeft: 0,
        playlistsCreated: 0,
        averageTimePerUpdate: 0,
        qualityEngagements: {
          fullArticleReads: 0,
          fullTrackListens: 0,
          eventAttendanceIntent: 0
        }
      }
    };
  }

  async calculateComparisons(userId, period) {
    // Placeholder for period-over-period and platform comparisons
    return {
      periodOverPeriod: {
        artistsFollowedChange: 0,
        engagementRateChange: 0,
        discoveryRateChange: 0,
        listeningTimeChange: 0,
        contentSatisfactionChange: 0
      },
      platformComparison: {
        engagementVsAverage: 1.0,
        discoveryVsAverage: 1.0,
        listeningTimeVsAverage: 1.0,
        diversityVsAverage: 1.0
      }
    };
  }

  async generateInsights(userId, dateRange) {
    const insights = [];
    
    // Get user memories for context
    const memories = await ragMemoryService.searchMemories(userId, 'music preference', 5);
    
    if (memories?.results?.length > 0) {
      insights.push('Your music taste is evolving based on recent discoveries');
    }
    
    return {
      behaviorInsights: insights,
      predictions: {
        likelyToEnjoy: ['indie rock', 'alternative'],
        optimalNotificationTime: 'evening',
        churnProbability: 0.1,
        nextDiscoveryCategory: 'similar_artists'
      },
      recommendations: {
        feedOptimization: 'Increase release notifications',
        notificationFrequency: 'daily',
        contentTypes: ['releases', 'tours']
      }
    };
  }

  // Utility methods

  async updateRealTimeAnalytics(userId, event) {
    // Update real-time analytics counters
    // Implementation would update various counters based on event type
  }

  calculateDateRange(period) {
    const now = new Date();
    let start;

    switch (period) {
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        const weekStart = now.getDate() - now.getDay();
        start = new Date(now.getFullYear(), now.getMonth(), weekStart);
        break;
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'yearly':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all_time':
      default:
        start = new Date('2024-01-01'); // Platform launch date
        break;
    }

    return { start, end: now };
  }

  getInteractionImportance(interactionType) {
    const importanceMap = {
      'view': 0.3,
      'click': 0.6,
      'share': 0.8,
      'save': 0.9,
      'like': 0.5,
      'comment': 0.7,
      'follow': 0.9
    };
    return importanceMap[interactionType] || 0.5;
  }

  calculateDataCompleteness(user) {
    let completeness = 0.5; // Base score
    
    if (user.musicProfile?.spotify?.connected) completeness += 0.3;
    if (user.artistPreferences?.followedArtists?.length > 0) completeness += 0.2;
    
    return Math.min(completeness, 1.0);
  }

  calculateDataFreshness(user) {
    const lastActivity = user.musicProfile?.lastUpdated || user.updatedAt;
    const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceActivity < 1) return 1.0;
    if (daysSinceActivity < 7) return 0.8;
    if (daysSinceActivity < 30) return 0.6;
    return 0.3;
  }

  // Export helper methods
  getTotalArtistsFollowed(allAnalytics) {
    const latest = allAnalytics.find(a => a.period === 'all_time');
    return latest?.artistEngagement?.totalArtistsFollowed || 0;
  }

  getTotalEngagements(allAnalytics) {
    const latest = allAnalytics.find(a => a.period === 'all_time');
    return latest?.engagement?.deepEngagement?.totalEngagements || 0;
  }

  getTotalDiscoveries(allAnalytics) {
    const latest = allAnalytics.find(a => a.period === 'all_time');
    return latest?.discovery?.patterns?.discoveriesThisPeriod || 0;
  }

  getAverageEngagementRate(allAnalytics) {
    const latest = allAnalytics.find(a => a.period === 'all_time');
    return latest?.engagement?.health?.overallEngagementRate || 0;
  }

  convertToCSV(data) {
    // Simple CSV conversion - would need more sophisticated formatting
    const headers = ['Metric', 'Value'];
    const rows = [
      ['User ID', data.userId],
      ['Artists Followed', data.summary.totalArtistsFollowed],
      ['Total Engagements', data.summary.totalEngagements],
      ['Discovery Count', data.summary.discoveryCount],
      ['Avg Engagement Rate', data.summary.avgEngagementRate]
    ];

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}

export default new UserAnalyticsService();