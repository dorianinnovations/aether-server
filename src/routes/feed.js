import express from 'express';
import { protect } from '../middleware/auth.js';
import artistFeedService from '../services/artistFeedService.js';
import userAnalyticsService from '../services/userAnalyticsService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get personalized artist update timeline
router.get('/timeline', protect, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 20,
      contentTypes = 'release,news,tour',
      priority = 'all',
      since,
      includeEngagement = 'false'
    } = req.query;

    log.info('Get personalized feed request', { 
      userId: req.user.id, 
      page: parseInt(page),
      contentTypes: contentTypes.split(','),
      priority
    });

    const feed = await artistFeedService.getPersonalizedFeed(req.user.id, {
      page: parseInt(page),
      limit: parseInt(limit),
      contentTypes: contentTypes.split(','),
      priority,
      since,
      includeEngagementData: includeEngagement === 'true'
    });

    res.json({
      success: true,
      ...feed
    });

  } catch (error) {
    log.error('Get personalized feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get new music releases from followed artists
router.get('/releases', protect, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 20,
      timeframe = '30d'
    } = req.query;

    log.info('Get releases feed request', { 
      userId: req.user.id, 
      timeframe
    });

    const releases = await artistFeedService.getUpdatesByType(
      req.user.id, 
      'release', 
      {
        page: parseInt(page),
        limit: parseInt(limit),
        timeframe
      }
    );

    res.json({
      success: true,
      ...releases
    });

  } catch (error) {
    log.error('Get releases feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get news updates from followed artists
router.get('/news', protect, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 20,
      timeframe = '7d'
    } = req.query;

    log.info('Get news feed request', { 
      userId: req.user.id, 
      timeframe
    });

    const news = await artistFeedService.getUpdatesByType(
      req.user.id, 
      'news', 
      {
        page: parseInt(page),
        limit: parseInt(limit),
        timeframe
      }
    );

    res.json({
      success: true,
      ...news
    });

  } catch (error) {
    log.error('Get news feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get tour announcements and events from followed artists
router.get('/tours', protect, async (req, res) => {
  try {
    const { 
      page = 1,
      limit = 20,
      timeframe = '90d'
    } = req.query;

    log.info('Get tours feed request', { 
      userId: req.user.id, 
      timeframe
    });

    const tours = await artistFeedService.getUpdatesByType(
      req.user.id, 
      'tour', 
      {
        page: parseInt(page),
        limit: parseInt(limit),
        timeframe
      }
    );

    res.json({
      success: true,
      ...tours
    });

  } catch (error) {
    log.error('Get tours feed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark updates as viewed
router.post('/mark-viewed', protect, async (req, res) => {
  try {
    const { updateIds } = req.body;

    if (!updateIds || !Array.isArray(updateIds) || updateIds.length === 0) {
      return res.status(400).json({ error: 'Array of update IDs is required' });
    }

    log.info('Mark updates as viewed request', { 
      userId: req.user.id, 
      count: updateIds.length
    });

    const result = await artistFeedService.markUpdatesAsViewed(req.user.id, updateIds);

    res.json({
      success: true,
      message: `Marked ${result.viewedCount} updates as viewed`,
      ...result
    });

  } catch (error) {
    log.error('Mark updates as viewed error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record interaction with an update
router.post('/interact/:updateId', protect, async (req, res) => {
  try {
    const { updateId } = req.params;
    const { type, metadata = {} } = req.body;

    if (!type || !['click', 'share', 'save', 'like', 'comment'].includes(type)) {
      return res.status(400).json({ 
        error: 'Valid interaction type (click, share, save, like, comment) is required' 
      });
    }

    log.info('Record interaction request', { 
      userId: req.user.id, 
      updateId,
      interactionType: type
    });

    const result = await artistFeedService.recordInteraction(
      req.user.id, 
      updateId, 
      type, 
      metadata
    );

    res.json({
      success: true,
      message: `Recorded ${type} interaction`,
      ...result
    });

  } catch (error) {
    log.error('Record interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get feed preferences
router.get('/preferences', protect, async (req, res) => {
  try {
    log.info('Get feed preferences request', { userId: req.user.id });

    const preferences = await artistFeedService.getFeedPreferences(req.user.id);

    res.json({
      success: true,
      preferences
    });

  } catch (error) {
    log.error('Get feed preferences error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update feed preferences
router.put('/preferences', protect, async (req, res) => {
  try {
    const { preferences } = req.body;

    if (!preferences) {
      return res.status(400).json({ error: 'Feed preferences are required' });
    }

    log.info('Update feed preferences request', { 
      userId: req.user.id, 
      preferences
    });

    const result = await artistFeedService.updateFeedPreferences(
      req.user.id, 
      preferences
    );

    res.json({
      success: true,
      message: 'Feed preferences updated',
      ...result
    });

  } catch (error) {
    log.error('Update feed preferences error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get feed statistics for the user
router.get('/stats', protect, async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;

    log.info('Get feed stats request', { 
      userId: req.user.id, 
      timeframe
    });

    // Get comprehensive feed statistics from user analytics
    const analytics = await userAnalyticsService.getUserAnalyticsOverview(
      req.user.id, 
      'all_time'
    );

    const feedStats = {
      totalArtistsFollowed: analytics.summary.artistsFollowed,
      totalUpdatesViewed: analytics.detailed.contentConsumption.totalUpdatesViewed,
      engagementRate: analytics.summary.engagementRate,
      contentBreakdown: analytics.detailed.contentConsumption.byContentType,
      discoveredThisPeriod: analytics.summary.newDiscoveries,
      topEngagedArtists: analytics.detailed.artistEngagement.topArtists.slice(0, 5)
    };

    res.json({
      success: true,
      timeframe,
      stats: feedStats
    });

  } catch (error) {
    log.error('Get feed stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get trending content across all artists
router.get('/trending', protect, async (req, res) => {
  try {
    const { 
      limit = 10,
      contentTypes = 'release,news,tour',
      timeframe = '7d'
    } = req.query;

    log.info('Get trending content request', { 
      userId: req.user.id, 
      contentTypes: contentTypes.split(','),
      timeframe
    });

    // Get trending artist updates
    const ArtistUpdate = (await import('../models/ArtistUpdate.js')).default;
    
    const dateRange = this.calculateDateRange(timeframe);
    
    const trendingUpdates = await ArtistUpdate.find({
      updateType: { $in: contentTypes.split(',') },
      'distribution.originalPublishDate': {
        $gte: dateRange.start,
        $lte: dateRange.end
      },
      'lifecycle.isActive': true,
      'targeting.relevanceScore': { $gt: 0.7 }
    })
    .sort({ 
      'engagement.totalEngagements': -1,
      'distribution.stats.totalViews': -1,
      'targeting.relevanceScore': -1 
    })
    .limit(parseInt(limit))
    .lean();

    res.json({
      success: true,
      trending: trendingUpdates,
      timeframe,
      totalFound: trendingUpdates.length
    });

  } catch (error) {
    log.error('Get trending content error:', error);
    res.status(500).json({ error: 'Failed to get trending content' });
  }
});

// Utility method for date range calculation
function calculateDateRange(timeframe) {
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

export default router;