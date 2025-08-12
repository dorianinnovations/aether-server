/**
 * Live Feed Routes - Real-time aggregation approach
 * No stored data, fresh content every time
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import liveNewsAggregator from '../services/liveNewsAggregator.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get live personalized feed
router.get('/timeline', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('🎯 Live feed request', { userId: req.user.id, limit });

    // Get user's followed artists
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.artistPreferences?.followedArtists?.length) {
      return res.json({
        success: true,
        data: [],
        message: 'Follow some artists to see personalized content',
        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNextPage: false }
      });
    }

    // Extract artist names from user's follows
    const followedArtists = user.artistPreferences.followedArtists.map(follow => ({
      name: follow.artistName || follow.name,
      id: follow.artistId
    }));

    // Get live aggregated content
    const feedItems = await liveNewsAggregator.getPersonalizedFeed(
      followedArtists, 
      'timeline', 
      parseInt(limit)
    );

    // Transform to match frontend expectations
    const transformedItems = feedItems.map(item => ({
      id: item.id,
      artistId: item.artistName, // Use artist name as ID for live content
      artist: {
        name: item.artistName,
        image: item.imageUrl
      },
      type: item.type,
      title: item.title,
      content: item.description,
      url: item.url,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      source: item.source,
      viewed: false,
      interacted: false,
      priority: item.relevanceScore > 0.8 ? 'high' : item.relevanceScore > 0.5 ? 'medium' : 'low',
      engagementScore: item.relevanceScore
    }));

    log.info(`✅ Served ${transformedItems.length} live feed items to user ${req.user.id}`);

    res.json({
      success: true,
      data: transformedItems,
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: transformedItems.length,
        hasNextPage: false,
        itemsPerPage: transformedItems.length
      },
      meta: {
        isLive: true,
        lastUpdated: new Date().toISOString(),
        followedArtists: followedArtists.length
      }
    });

  } catch (error) {
    log.error('Live feed error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load live feed',
      details: error.message 
    });
  }
});

// Get live releases feed
router.get('/releases', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('🎵 Live releases request', { userId: req.user.id, limit });

    // Get user's followed artists
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.artistPreferences?.followedArtists?.length) {
      return res.json({
        success: true,
        data: [],
        message: 'Follow some artists to see their latest releases'
      });
    }

    const followedArtists = user.artistPreferences.followedArtists.map(follow => ({
      name: follow.artistName || follow.name,
      id: follow.artistId
    }));

    // Get live releases
    const feedItems = await liveNewsAggregator.getPersonalizedFeed(
      followedArtists, 
      'releases', 
      parseInt(limit)
    );

    const transformedItems = feedItems.map(item => ({
      id: item.id,
      artistId: item.artistName,
      artist: {
        name: item.artistName,
        image: item.imageUrl
      },
      type: 'release',
      title: item.title,
      content: item.description,
      url: item.url,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      source: item.source,
      metadata: item.metadata
    }));

    res.json({
      success: true,
      data: transformedItems,
      meta: {
        isLive: true,
        contentType: 'releases',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('Live releases error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load live releases' 
    });
  }
});

// Get live news feed
router.get('/news', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('📰 Live news request', { userId: req.user.id, limit });

    // Get user's followed artists
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.artistPreferences?.followedArtists?.length) {
      return res.json({
        success: true,
        data: [],
        message: 'Follow some artists to see news about them'
      });
    }

    const followedArtists = user.artistPreferences.followedArtists.map(follow => ({
      name: follow.artistName || follow.name,
      id: follow.artistId
    }));

    // Get live news
    const feedItems = await liveNewsAggregator.getPersonalizedFeed(
      followedArtists, 
      'news', 
      parseInt(limit)
    );

    const transformedItems = feedItems.map(item => ({
      id: item.id,
      artistId: item.artistName,
      artist: {
        name: item.artistName,
        image: item.imageUrl
      },
      type: 'news',
      title: item.title,
      content: item.description,
      url: item.url,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      source: item.source
    }));

    res.json({
      success: true,
      data: transformedItems,
      meta: {
        isLive: true,
        contentType: 'news',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('Live news error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load live news' 
    });
  }
});

// Get trending content
router.get('/trending', protect, async (req, res) => {
  try {
    const { limit = 15 } = req.query;

    log.info('📈 Trending content request', { userId: req.user.id, limit });

    // Get user's followed artists for context
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    const followedArtists = user?.artistPreferences?.followedArtists?.map(follow => ({
      name: follow.artistName || follow.name,
      id: follow.artistId
    })) || [];

    // Get trending content (works even without followed artists)
    const artistNames = followedArtists.length > 0 
      ? followedArtists.map(a => a.name)
      : ['Drake', 'Kendrick Lamar', 'J. Cole', 'Travis Scott', 'Future']; // Fallback popular artists

    const trendingItems = await liveNewsAggregator.getTrendingContent(
      artistNames, 
      parseInt(limit)
    );

    const transformedItems = trendingItems.map(item => ({
      id: item.id,
      artistId: item.artistName,
      artist: {
        name: item.artistName,
        image: item.imageUrl
      },
      type: 'trending',
      title: item.title,
      content: item.description,
      url: item.url,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      source: item.source,
      trendScore: item.relevanceScore
    }));

    res.json({
      success: true,
      data: transformedItems,
      meta: {
        isLive: true,
        contentType: 'trending',
        timeframe: '24h',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('Trending content error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load trending content' 
    });
  }
});

// Quick artist add for testing
router.post('/follow-artist', protect, async (req, res) => {
  try {
    const { artistName } = req.body;

    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required' });
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    if (!user.artistPreferences) user.artistPreferences = {};
    if (!user.artistPreferences.followedArtists) user.artistPreferences.followedArtists = [];

    // Check if already following
    const alreadyFollowing = user.artistPreferences.followedArtists.some(
      follow => follow.artistName === artistName
    );

    if (alreadyFollowing) {
      return res.json({ success: true, message: `Already following ${artistName}` });
    }

    // Add artist to followed list
    user.artistPreferences.followedArtists.push({
      artistId: `quick_${artistName.toLowerCase().replace(/\s+/g, '_')}`,
      artistName,
      followedAt: new Date(),
      notificationSettings: {
        releases: true,
        news: true,
        tours: true,
        social: false
      }
    });

    await user.save();

    log.info(`User ${req.user.id} is now following ${artistName}`);

    res.json({
      success: true,
      message: `Now following ${artistName}`,
      followedArtists: user.artistPreferences.followedArtists.length
    });

  } catch (error) {
    log.error('Follow artist error:', error);
    res.status(500).json({ error: 'Failed to follow artist' });
  }
});

export default router;