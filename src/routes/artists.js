import express from 'express';
import { protect } from '../middleware/auth.js';
import artistDiscoveryService from '../services/artistDiscoveryService.js';
import artistFeedService from '../services/artistFeedService.js';
import userAnalyticsService from '../services/userAnalyticsService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Search for artists across platforms
router.get('/search', protect, async (req, res) => {
  try {
    const { 
      q: query,
      limit = 20,
      platforms = 'spotify,lastfm',
      minPopularity = 0
    } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    log.info('Artist search request', { 
      userId: req.user.id, 
      query, 
      platforms: platforms.split(',') 
    });

    const results = await artistDiscoveryService.searchArtists(query, {
      limit: parseInt(limit),
      platforms: platforms.split(','),
      minPopularity: parseInt(minPopularity)
    });

    res.json({
      success: true,
      query,
      ...results
    });

  } catch (error) {
    log.error('Artist search error:', error);
    res.status(500).json({ error: 'Failed to search artists' });
  }
});

// Follow an artist
router.post('/follow', protect, async (req, res) => {
  try {
    const { artistData, notificationSettings = {} } = req.body;

    if (!artistData || !artistData.artistId || !artistData.name) {
      return res.status(400).json({ 
        error: 'Artist data with artistId and name is required' 
      });
    }

    log.info('Follow artist request', { 
      userId: req.user.id, 
      artistId: artistData.artistId,
      artistName: artistData.name
    });

    const result = await artistDiscoveryService.followArtist(
      req.user.id, 
      artistData, 
      notificationSettings
    );

    // Track the follow action for analytics
    await userAnalyticsService.trackInteraction(
      req.user.id, 
      artistData.artistId, 
      'follow',
      { artistName: artistData.name }
    );

    res.json({
      success: true,
      message: `Successfully followed ${artistData.name}`,
      ...result
    });

  } catch (error) {
    log.error('Follow artist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unfollow an artist
router.delete('/unfollow', protect, async (req, res) => {
  try {
    const { artistId } = req.body;

    if (!artistId) {
      return res.status(400).json({ error: 'Artist ID is required' });
    }

    log.info('Unfollow artist request', { 
      userId: req.user.id, 
      artistId 
    });

    const result = await artistDiscoveryService.unfollowArtist(req.user.id, artistId);

    // Track the unfollow action for analytics
    await userAnalyticsService.trackInteraction(
      req.user.id, 
      artistId, 
      'unfollow'
    );

    res.json({
      success: true,
      message: 'Successfully unfollowed artist',
      ...result
    });

  } catch (error) {
    log.error('Unfollow artist error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's followed artists
router.get('/following', protect, async (req, res) => {
  try {
    const { 
      includeDetails = 'true',
      sortBy = 'followedAt',
      limit 
    } = req.query;

    log.info('Get followed artists request', { 
      userId: req.user.id, 
      includeDetails: includeDetails === 'true'
    });

    const followedArtists = await artistDiscoveryService.getFollowedArtists(
      req.user.id,
      {
        includeDetails: includeDetails === 'true',
        sortBy,
        limit: limit ? parseInt(limit) : undefined
      }
    );

    res.json({
      success: true,
      followedArtists,
      totalCount: followedArtists.length
    });

  } catch (error) {
    log.error('Get followed artists error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get personalized artist recommendations
router.get('/discover', protect, async (req, res) => {
  try {
    const { 
      limit = 10,
      types = 'similar,genre,trending'
    } = req.query;

    log.info('Artist discovery request', { 
      userId: req.user.id, 
      types: types.split(',')
    });

    const recommendations = await artistDiscoveryService.getPersonalizedRecommendations(
      req.user.id,
      {
        limit: parseInt(limit),
        types: types.split(',')
      }
    );

    res.json({
      success: true,
      ...recommendations
    });

  } catch (error) {
    log.error('Artist discovery error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed artist information
router.get('/:artistId/details', protect, async (req, res) => {
  try {
    const { artistId } = req.params;

    log.info('Get artist details request', { 
      userId: req.user.id, 
      artistId 
    });

    const Artist = (await import('../models/Artist.js')).default;
    const artist = await Artist.findOne({ artistId }).lean();

    if (!artist) {
      return res.status(404).json({ error: 'Artist not found' });
    }

    // Get recent activity summary
    const recentActivity = artist.getRecentActivity ? artist.getRecentActivity(30) : null;

    res.json({
      success: true,
      artist,
      recentActivity
    });

  } catch (error) {
    log.error('Get artist details error:', error);
    res.status(500).json({ error: 'Failed to get artist details' });
  }
});

// Get updates from a specific artist
router.get('/:artistId/updates', protect, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { 
      page = 1,
      limit = 20,
      contentTypes = 'release,news,tour',
      since 
    } = req.query;

    log.info('Get artist updates request', { 
      userId: req.user.id, 
      artistId,
      contentTypes: contentTypes.split(',')
    });

    const result = await artistFeedService.getArtistUpdates(artistId, {
      page: parseInt(page),
      limit: parseInt(limit),
      contentTypes: contentTypes.split(','),
      since
    });

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    log.error('Get artist updates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update notification settings for followed artist
router.put('/:artistId/notifications', protect, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { notificationSettings } = req.body;

    if (!notificationSettings) {
      return res.status(400).json({ error: 'Notification settings are required' });
    }

    log.info('Update artist notifications request', { 
      userId: req.user.id, 
      artistId,
      notificationSettings
    });

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find and update the followed artist's notification settings
    const followedArtist = user.artistPreferences?.followedArtists?.find(
      follow => follow.artistId === artistId
    );

    if (!followedArtist) {
      return res.status(404).json({ error: 'Artist not followed' });
    }

    followedArtist.notificationSettings = {
      ...followedArtist.notificationSettings,
      ...notificationSettings
    };

    await user.save();

    res.json({
      success: true,
      message: 'Notification settings updated',
      notificationSettings: followedArtist.notificationSettings
    });

  } catch (error) {
    log.error('Update artist notifications error:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Update artist priority (high, medium, low)
router.put('/:artistId/priority', protect, async (req, res) => {
  try {
    const { artistId } = req.params;
    const { priority } = req.body;

    if (!priority || !['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ 
        error: 'Valid priority (high, medium, low) is required' 
      });
    }

    log.info('Update artist priority request', { 
      userId: req.user.id, 
      artistId,
      priority
    });

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find and update the followed artist's priority
    const followedArtist = user.artistPreferences?.followedArtists?.find(
      follow => follow.artistId === artistId
    );

    if (!followedArtist) {
      return res.status(404).json({ error: 'Artist not followed' });
    }

    followedArtist.priority = priority;
    await user.save();

    res.json({
      success: true,
      message: 'Artist priority updated',
      priority
    });

  } catch (error) {
    log.error('Update artist priority error:', error);
    res.status(500).json({ error: 'Failed to update artist priority' });
  }
});

export default router;