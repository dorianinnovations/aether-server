import ArtistUpdate from '../models/ArtistUpdate.js';
import UserAnalytics from '../models/UserAnalytics.js';
import ragMemoryService from './ragMemoryService.js';

class ArtistFeedService {
  constructor() {
    this.defaultPageSize = 20;
    this.maxPageSize = 100;
  }

  /**
   * Get personalized artist update feed for a user
   */
  async getPersonalizedFeed(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = this.defaultPageSize,
        contentTypes = ['release', 'news', 'tour'],
        priority = 'all',
        since,
        includeEngagementData = false
      } = options;

      console.log(`📰 Getting personalized feed for user ${userId}`);

      // Get user's followed artists and preferences
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const followedArtists = user.artistPreferences?.followedArtists || [];
      if (followedArtists.length === 0) {
        return {
          updates: [],
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalItems: 0,
            hasNextPage: false
          },
          feedStats: {
            totalUpdates: 0,
            byType: {}
          }
        };
      }

      // Build query for user's content preferences
      const query = await this.buildFeedQuery(userId, followedArtists, {
        contentTypes,
        priority,
        since
      });

      // Get user analytics for personalization
      const userAnalytics = await UserAnalytics.findOne({ 
        userId, 
        period: 'all_time' 
      });

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const actualLimit = Math.min(limit, this.maxPageSize);

      const [updates, totalCount] = await Promise.all([
        ArtistUpdate.find(query)
          .sort({ 
            'targeting.relevanceScore': -1,
            'distribution.originalPublishDate': -1 
          })
          .skip(skip)
          .limit(actualLimit)
          .lean(),
        ArtistUpdate.countDocuments(query)
      ]);

      // Personalize the feed order
      const personalizedUpdates = await this.personalizeUpdates(
        updates, 
        userId, 
        userAnalytics
      );

      // Add engagement data if requested
      if (includeEngagementData) {
        await this.addEngagementData(personalizedUpdates, userId);
      }

      // Calculate feed statistics
      const feedStats = await this.calculateFeedStats(query);

      // Track feed view for analytics
      await this.trackFeedView(userId, personalizedUpdates.length);

      const totalPages = Math.ceil(totalCount / actualLimit);

      console.log(`✅ Retrieved ${personalizedUpdates.length} updates for user feed`);

      return {
        updates: personalizedUpdates,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          hasNextPage: page < totalPages,
          itemsPerPage: actualLimit
        },
        feedStats,
        personalizationApplied: true
      };

    } catch (error) {
      console.error('Error getting personalized feed:', error);
      throw new Error(`Failed to get personalized feed: ${error.message}`);
    }
  }

  /**
   * Get updates for a specific artist
   */
  async getArtistUpdates(artistId, options = {}) {
    try {
      const {
        page = 1,
        limit = this.defaultPageSize,
        contentTypes = ['release', 'news', 'tour'],
        since
      } = options;

      console.log(`🎤 Getting updates for artist: ${artistId}`);

      const query = {
        artistId,
        'lifecycle.isActive': true,
        'lifecycle.isArchived': false
      };

      // Filter by content types
      if (contentTypes.length > 0) {
        query.updateType = { $in: contentTypes };
      }

      // Filter by date if specified
      if (since) {
        query['distribution.originalPublishDate'] = { 
          $gte: new Date(since) 
        };
      }

      const skip = (page - 1) * limit;
      const actualLimit = Math.min(limit, this.maxPageSize);

      const [updates, totalCount] = await Promise.all([
        ArtistUpdate.find(query)
          .sort({ 'distribution.originalPublishDate': -1 })
          .skip(skip)
          .limit(actualLimit)
          .lean(),
        ArtistUpdate.countDocuments(query)
      ]);

      const totalPages = Math.ceil(totalCount / actualLimit);

      return {
        updates,
        artistId,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          hasNextPage: page < totalPages
        }
      };

    } catch (error) {
      console.error('Error getting artist updates:', error);
      throw new Error(`Failed to get artist updates: ${error.message}`);
    }
  }

  /**
   * Get updates by content type (releases, news, tours, etc.)
   */
  async getUpdatesByType(userId, contentType, options = {}) {
    try {
      const {
        page = 1,
        limit = this.defaultPageSize,
        timeframe = '30d'
      } = options;

      console.log(`📋 Getting ${contentType} updates for user ${userId}`);

      // Get user's followed artists
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      const followedArtistIds = user.artistPreferences?.followedArtists?.map(
        follow => follow.artistId
      ) || [];

      if (followedArtistIds.length === 0) {
        return {
          updates: [],
          contentType,
          pagination: { currentPage: page, totalPages: 0, totalItems: 0, hasNextPage: false }
        };
      }

      // Calculate date range
      const dateRange = this.calculateDateRange(timeframe);

      const query = {
        artistId: { $in: followedArtistIds },
        updateType: contentType,
        'lifecycle.isActive': true,
        'distribution.originalPublishDate': {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      };

      const skip = (page - 1) * limit;
      const actualLimit = Math.min(limit, this.maxPageSize);

      const [updates, totalCount] = await Promise.all([
        ArtistUpdate.find(query)
          .sort({ 'distribution.originalPublishDate': -1 })
          .skip(skip)
          .limit(actualLimit)
          .lean(),
        ArtistUpdate.countDocuments(query)
      ]);

      return {
        updates,
        contentType,
        timeframe,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / actualLimit),
          totalItems: totalCount,
          hasNextPage: page < Math.ceil(totalCount / actualLimit)
        }
      };

    } catch (error) {
      console.error('Error getting updates by type:', error);
      throw new Error(`Failed to get ${contentType} updates: ${error.message}`);
    }
  }

  /**
   * Mark updates as viewed by user
   */
  async markUpdatesAsViewed(userId, updateIds) {
    try {
      console.log(`👁️ Marking ${updateIds.length} updates as viewed by user ${userId}`);

      const updates = await ArtistUpdate.find({
        _id: { $in: updateIds },
        'lifecycle.isActive': true
      });

      for (const update of updates) {
        // Check if user already viewed this update
        const existingView = update.engagement?.viewedBy?.find(
          view => view.userId.toString() === userId
        );

        if (!existingView) {
          // Add view record
          if (!update.engagement) update.engagement = { viewedBy: [] };
          if (!update.engagement.viewedBy) update.engagement.viewedBy = [];

          update.engagement.viewedBy.push({
            userId,
            viewedAt: new Date(),
            source: 'feed'
          });

          // Update view stats
          if (!update.distribution.stats) update.distribution.stats = {};
          update.distribution.stats.totalViews = (update.distribution.stats.totalViews || 0) + 1;

          await update.save();
        }
      }

      // Update user analytics
      await this.updateUserViewAnalytics(userId, updateIds.length);

      console.log(`✅ Marked ${updateIds.length} updates as viewed`);
      return { success: true, viewedCount: updateIds.length };

    } catch (error) {
      console.error('Error marking updates as viewed:', error);
      throw new Error(`Failed to mark updates as viewed: ${error.message}`);
    }
  }

  /**
   * Record user interaction with an update
   */
  async recordInteraction(userId, updateId, interactionType, metadata = {}) {
    try {
      console.log(`🔗 Recording ${interactionType} interaction for update ${updateId} by user ${userId}`);

      const update = await ArtistUpdate.findById(updateId);
      if (!update) {
        throw new Error('Update not found');
      }

      // Add interaction record
      if (!update.engagement) update.engagement = { interactions: [] };
      if (!update.engagement.interactions) update.engagement.interactions = [];

      update.engagement.interactions.push({
        userId,
        type: interactionType,
        timestamp: new Date(),
        metadata
      });

      // Update engagement stats
      update.engagement.totalEngagements = (update.engagement.totalEngagements || 0) + 1;
      update.engagement.lastEngagement = new Date();

      // Update distribution stats
      if (!update.distribution.stats) update.distribution.stats = {};
      
      if (interactionType === 'click') {
        update.distribution.stats.usersEngaged = (update.distribution.stats.usersEngaged || 0) + 1;
      }

      await update.save();

      // Update user analytics
      await this.updateUserEngagementAnalytics(userId, interactionType, update.artistId);

      // Store interaction in user's memory for personalization
      await ragMemoryService.storeMemory(userId, {
        type: 'engagement',
        content: `User ${interactionType} update "${update.title}" from ${update.artistName}`,
        importance: this.getInteractionImportance(interactionType),
        metadata: {
          artist: update.artistName,
          artistId: update.artistId,
          updateType: update.updateType,
          interaction: interactionType
        }
      });

      console.log(`✅ Recorded ${interactionType} interaction`);
      return { success: true };

    } catch (error) {
      console.error('Error recording interaction:', error);
      throw new Error(`Failed to record interaction: ${error.message}`);
    }
  }

  /**
   * Get feed preferences for a user
   */
  async getFeedPreferences(userId) {
    try {
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      return user.artistPreferences?.feedPreferences || {
        contentTypes: {
          releases: true,
          news: true,
          tours: true,
          social: false,
          interviews: false
        },
        updateFrequency: 'daily',
        maxUpdatesPerDay: 20
      };

    } catch (error) {
      console.error('Error getting feed preferences:', error);
      throw error;
    }
  }

  /**
   * Update feed preferences for a user
   */
  async updateFeedPreferences(userId, preferences) {
    try {
      console.log(`⚙️ Updating feed preferences for user ${userId}`);

      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Initialize artistPreferences if needed
      if (!user.artistPreferences) user.artistPreferences = {};
      if (!user.artistPreferences.feedPreferences) user.artistPreferences.feedPreferences = {};

      // Update preferences
      Object.assign(user.artistPreferences.feedPreferences, preferences);

      await user.save();

      console.log(`✅ Updated feed preferences`);
      return { success: true, preferences: user.artistPreferences.feedPreferences };

    } catch (error) {
      console.error('Error updating feed preferences:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  async buildFeedQuery(userId, followedArtists, options) {
    const { contentTypes, priority, since } = options;

    // Get user's notification preferences per artist
    const artistNotificationMap = {};
    followedArtists.forEach(follow => {
      artistNotificationMap[follow.artistId] = follow.notificationSettings;
    });

    const query = {
      artistId: { $in: followedArtists.map(f => f.artistId) },
      'lifecycle.isActive': true,
      'lifecycle.isArchived': false
    };

    // Filter by content types and user preferences
    const allowedTypes = [];
    for (const type of contentTypes) {
      // Check if user wants this type of content from any followed artist
      const hasArtistWantingType = followedArtists.some(follow => 
        follow.notificationSettings?.[this.mapContentTypeToNotification(type)] !== false
      );
      if (hasArtistWantingType) {
        allowedTypes.push(type);
      }
    }

    if (allowedTypes.length > 0) {
      query.updateType = { $in: allowedTypes };
    }

    // Filter by priority
    if (priority !== 'all') {
      query['targeting.priority'] = priority;
    }

    // Filter by date
    if (since) {
      query['distribution.originalPublishDate'] = { $gte: new Date(since) };
    } else {
      // Default to updates from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query['distribution.originalPublishDate'] = { $gte: thirtyDaysAgo };
    }

    return query;
  }

  async personalizeUpdates(updates, userId, userAnalytics) {
    // Score updates based on user preferences and engagement history
    const scoredUpdates = updates.map(update => {
      let score = 0;

      // Base score from update priority
      const priorityScores = { urgent: 100, high: 75, medium: 50, low: 25 };
      score += priorityScores[update.targeting?.priority] || 50;

      // Boost based on user's past engagement with this artist
      if (userAnalytics?.artistEngagement?.topArtists) {
        const artistEngagement = userAnalytics.artistEngagement.topArtists.find(
          artist => artist.artistId === update.artistId
        );
        if (artistEngagement) {
          score += artistEngagement.engagementScore * 20;
        }
      }

      // Boost newer content
      const hoursOld = (Date.now() - new Date(update.distribution.originalPublishDate).getTime()) / (1000 * 60 * 60);
      if (hoursOld < 24) score += 20;
      else if (hoursOld < 72) score += 10;

      // Boost based on content type preferences
      const contentTypeBoosts = {
        release: 30,
        tour: 25,
        news: 20,
        interview: 15,
        social: 10
      };
      score += contentTypeBoosts[update.updateType] || 15;

      return { ...update, personalizationScore: score };
    });

    // Sort by personalization score
    return scoredUpdates.sort((a, b) => b.personalizationScore - a.personalizationScore);
  }

  async addEngagementData(updates, userId) {
    for (const update of updates) {
      const hasViewed = update.engagement?.viewedBy?.some(
        view => view.userId.toString() === userId
      );
      
      const userInteractions = update.engagement?.interactions?.filter(
        interaction => interaction.userId.toString() === userId
      ) || [];

      update.userEngagement = {
        hasViewed,
        interactions: userInteractions,
        interactionCount: userInteractions.length
      };
    }
  }

  async calculateFeedStats(query) {
    const typeAggregation = await ArtistUpdate.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$updateType',
          count: { $sum: 1 }
        }
      }
    ]);

    const byType = {};
    typeAggregation.forEach(item => {
      byType[item._id] = item.count;
    });

    return {
      totalUpdates: typeAggregation.reduce((sum, item) => sum + item.count, 0),
      byType
    };
  }

  async trackFeedView(userId, updatesCount) {
    try {
      // Update user analytics for feed viewing
      const today = new Date().toISOString().slice(0, 10);
      const User = (await import('../models/User.js')).default;
      
      await User.findByIdAndUpdate(userId, {
        $inc: {
          'analytics.engagement.feedInteractions.$[elem].views': 1
        }
      }, {
        arrayFilters: [{ 'elem.date': today }],
        upsert: false
      });

      // If no entry for today, add one
      const user = await User.findById(userId);
      const todayEntry = user?.analytics?.engagement?.feedInteractions?.find(
        interaction => interaction.date === today
      );

      if (!todayEntry) {
        await User.findByIdAndUpdate(userId, {
          $push: {
            'analytics.engagement.feedInteractions': {
              date: today,
              views: 1,
              clicks: 0,
              shares: 0
            }
          }
        });
      }

    } catch (error) {
      console.error('Error tracking feed view:', error);
      // Don't throw - this shouldn't break the main flow
    }
  }

  async updateUserViewAnalytics(userId, viewCount) {
    try {
      await UserAnalytics.findOneAndUpdate(
        { userId, period: 'all_time' },
        {
          $inc: {
            'contentConsumption.totalUpdatesViewed': viewCount
          }
        },
        { upsert: false }
      );
    } catch (error) {
      console.error('Error updating user view analytics:', error);
    }
  }

  async updateUserEngagementAnalytics(userId, interactionType, artistId) {
    try {
      const updatePath = `contentConsumption.byContentType.${interactionType}.engaged`;
      
      await UserAnalytics.findOneAndUpdate(
        { userId, period: 'all_time' },
        { $inc: { [updatePath]: 1 } },
        { upsert: false }
      );
    } catch (error) {
      console.error('Error updating user engagement analytics:', error);
    }
  }

  getPrioritySort() {
    return {
      'urgent': 4,
      'high': 3, 
      'medium': 2,
      'low': 1
    };
  }

  mapContentTypeToNotification(contentType) {
    const mapping = {
      'release': 'releases',
      'news': 'news',
      'tour': 'tours',
      'interview': 'news',
      'social': 'social'
    };
    return mapping[contentType] || 'news';
  }

  getInteractionImportance(interactionType) {
    const importanceMap = {
      'click': 0.6,
      'share': 0.8,
      'save': 0.9,
      'like': 0.5,
      'comment': 0.7
    };
    return importanceMap[interactionType] || 0.5;
  }

  calculateDateRange(timeframe) {
    const now = new Date();
    let start;

    switch (timeframe) {
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end: now };
  }
}

export default new ArtistFeedService();