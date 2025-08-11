import express from 'express';
import { protect } from '../middleware/auth.js';
import userAnalyticsService from '../services/userAnalyticsService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get user analytics overview
router.get('/overview', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    if (!['daily', 'weekly', 'monthly', 'yearly', 'all_time'].includes(period)) {
      return res.status(400).json({ 
        error: 'Invalid period. Use: daily, weekly, monthly, yearly, or all_time' 
      });
    }

    log.info('Get analytics overview request', { 
      userId: req.user.id, 
      period 
    });

    const analytics = await userAnalyticsService.getUserAnalyticsOverview(
      req.user.id, 
      period
    );

    res.json({
      success: true,
      ...analytics
    });

  } catch (error) {
    log.error('Get analytics overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed artist listening analytics
router.get('/artists', protect, async (req, res) => {
  try {
    const { 
      period = 'all_time',
      limit = 20 
    } = req.query;

    log.info('Get artist analytics request', { 
      userId: req.user.id, 
      period,
      limit: parseInt(limit)
    });

    const artistAnalytics = await userAnalyticsService.getArtistAnalytics(
      req.user.id,
      {
        period,
        limit: parseInt(limit)
      }
    );

    res.json({
      success: true,
      period,
      ...artistAnalytics
    });

  } catch (error) {
    log.error('Get artist analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get music discovery analytics
router.get('/discovery', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    log.info('Get discovery analytics request', { 
      userId: req.user.id, 
      period
    });

    const discoveryAnalytics = await userAnalyticsService.getDiscoveryAnalytics(
      req.user.id, 
      period
    );

    res.json({
      success: true,
      period,
      ...discoveryAnalytics
    });

  } catch (error) {
    log.error('Get discovery analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get listening behavior analytics
router.get('/listening', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    log.info('Get listening analytics request', { 
      userId: req.user.id, 
      period
    });

    const listeningAnalytics = await userAnalyticsService.getListeningAnalytics(
      req.user.id, 
      period
    );

    res.json({
      success: true,
      period,
      ...listeningAnalytics
    });

  } catch (error) {
    log.error('Get listening analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get engagement quality metrics
router.get('/engagement', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    log.info('Get engagement analytics request', { 
      userId: req.user.id, 
      period
    });

    const engagementAnalytics = await userAnalyticsService.getEngagementAnalytics(
      req.user.id, 
      period
    );

    res.json({
      success: true,
      period,
      ...engagementAnalytics
    });

  } catch (error) {
    log.error('Get engagement analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get genre preference analytics
router.get('/genres', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    log.info('Get genre analytics request', { 
      userId: req.user.id, 
      period
    });

    // Get user's music taste from analytics
    const analytics = await userAnalyticsService.getUserAnalyticsOverview(
      req.user.id, 
      period
    );

    const genreAnalytics = {
      favoriteGenres: analytics.detailed.listeningBehavior.consumption.spotifyMetrics?.topGenres || [],
      genreEvolution: analytics.detailed.discovery.patterns.genreExploration || {},
      diversityScore: analytics.detailed.discovery.patterns.genreExploration?.genreDiversityScore || 0.5,
      newGenresExplored: analytics.detailed.discovery.patterns.genreExploration?.newGenresExplored || []
    };

    res.json({
      success: true,
      period,
      ...genreAnalytics
    });

  } catch (error) {
    log.error('Get genre analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Track user interaction for analytics
router.post('/track', protect, async (req, res) => {
  try {
    const { artistId, interactionType, metadata = {} } = req.body;

    if (!artistId || !interactionType) {
      return res.status(400).json({ 
        error: 'Artist ID and interaction type are required' 
      });
    }

    const validInteractionTypes = [
      'view', 'click', 'share', 'save', 'like', 'comment', 'follow', 'unfollow'
    ];

    if (!validInteractionTypes.includes(interactionType)) {
      return res.status(400).json({ 
        error: `Invalid interaction type. Valid types: ${validInteractionTypes.join(', ')}` 
      });
    }

    log.info('Track interaction request', { 
      userId: req.user.id, 
      artistId,
      interactionType
    });

    await userAnalyticsService.trackInteraction(
      req.user.id, 
      artistId, 
      interactionType, 
      metadata
    );

    res.json({
      success: true,
      message: 'Interaction tracked successfully'
    });

  } catch (error) {
    log.error('Track interaction error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export user analytics data
router.post('/export', protect, async (req, res) => {
  try {
    const { format = 'json' } = req.body;

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ 
        error: 'Invalid format. Use json or csv' 
      });
    }

    log.info('Export analytics request', { 
      userId: req.user.id, 
      format
    });

    const exportData = await userAnalyticsService.exportUserAnalytics(
      req.user.id, 
      format
    );

    const filename = `aether-analytics-${req.user.id}-${new Date().toISOString().split('T')[0]}.${format}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    }

  } catch (error) {
    log.error('Export analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get analytics insights and predictions
router.get('/insights', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.query;

    log.info('Get analytics insights request', { 
      userId: req.user.id, 
      period
    });

    const analytics = await userAnalyticsService.getUserAnalyticsOverview(
      req.user.id, 
      period
    );

    const insights = {
      behaviorInsights: analytics.insights.behaviorInsights,
      predictions: analytics.insights.predictions,
      recommendations: analytics.insights.recommendations,
      trends: {
        artistGrowth: analytics.detailed.comparisons?.periodOverPeriod?.artistsFollowedChange || 0,
        engagementTrend: analytics.detailed.comparisons?.periodOverPeriod?.engagementRateChange || 0,
        discoveryTrend: analytics.detailed.comparisons?.periodOverPeriod?.discoveryRateChange || 0
      },
      platformComparison: analytics.detailed.comparisons?.platformComparison || {}
    };

    res.json({
      success: true,
      period,
      insights
    });

  } catch (error) {
    log.error('Get analytics insights error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's music taste profile
router.get('/taste-profile', protect, async (req, res) => {
  try {
    log.info('Get taste profile request', { userId: req.user.id });

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tasteProfile = {
      favoriteGenres: user.artistPreferences?.musicTaste?.favoriteGenres || [],
      followedArtistsCount: user.artistPreferences?.followedArtists?.length || 0,
      discoveryPreferences: user.artistPreferences?.musicTaste?.discoveryPreferences || {},
      listeningPatterns: user.artistPreferences?.musicTaste?.listeningPatterns || {},
      spotifyData: {
        topTracks: user.musicProfile?.spotify?.topTracks?.slice(0, 10) || [],
        recentTracks: user.musicProfile?.spotify?.recentTracks?.slice(0, 10) || [],
        currentTrack: user.musicProfile?.spotify?.currentTrack || null
      }
    };

    res.json({
      success: true,
      tasteProfile
    });

  } catch (error) {
    log.error('Get taste profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Force recalculate user analytics (admin/debug endpoint)
router.post('/recalculate', protect, async (req, res) => {
  try {
    const { period = 'all_time' } = req.body;

    log.info('Recalculate analytics request', { 
      userId: req.user.id, 
      period
    });

    const analytics = await userAnalyticsService.calculateUserAnalytics(
      req.user.id, 
      period
    );

    res.json({
      success: true,
      message: 'Analytics recalculated successfully',
      calculatedAt: analytics.metadata.calculatedAt,
      period,
      processingTime: analytics.metadata.processingTime
    });

  } catch (error) {
    log.error('Recalculate analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;