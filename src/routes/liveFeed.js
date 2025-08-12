/**
 * Live Feed Routes - Real-time aggregation approach
 * No stored data, fresh content every time
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import liveNewsAggregator from '../services/liveNewsAggregator.js';
import freeNewsAggregator from '../services/freeNewsAggregator.js';
import { env } from '../config/environment.js';
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

    // Choose aggregator based on cost settings
    const useFreeMode = !env.SERPAPI_API_KEY || env.USE_FREE_NEWS_MODE === 'true';
    
    log.info(`📰 Using ${useFreeMode ? 'FREE' : 'PAID'} news aggregator`);
    
    const feedItems = useFreeMode 
      ? await freeNewsAggregator.getPersonalizedFeedFree(followedArtists, 'timeline', parseInt(limit))
      : await liveNewsAggregator.getPersonalizedFeed(followedArtists, 'timeline', parseInt(limit));

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

    // Choose aggregator based on cost settings
    const useFreeMode = !env.SERPAPI_API_KEY || env.USE_FREE_NEWS_MODE === 'true';
    
    // Get live releases
    const feedItems = useFreeMode 
      ? await freeNewsAggregator.getPersonalizedFeedFree(followedArtists, 'releases', parseInt(limit))
      : await liveNewsAggregator.getPersonalizedFeed(followedArtists, 'releases', parseInt(limit));

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

    // Choose aggregator based on cost settings
    const useFreeMode = !env.SERPAPI_API_KEY || env.USE_FREE_NEWS_MODE === 'true';
    
    // Get live news
    const feedItems = useFreeMode 
      ? await freeNewsAggregator.getPersonalizedFeedFree(followedArtists, 'news', parseInt(limit))
      : await liveNewsAggregator.getPersonalizedFeed(followedArtists, 'news', parseInt(limit));

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
    let artistNames = [];
    
    if (followedArtists.length > 0) {
      artistNames = followedArtists.map(a => a.name);
    } else {
      // Try to get artists from user memories instead of hardcoded ones
      try {
        const UserMemory = (await import('../models/UserMemory.js')).default;
        const artistMemories = await UserMemory.find({
          user: req.user.id,
          $or: [
            { content: { $regex: /artist|musician|rapper|singer/, $options: 'i' } },
            { content: { $regex: /Drake|Cole|Kendrick|Travis|Future|Eminem|Jay-Z|Kanye|Tyler|Mac Miller|Kid Cudi|Post Malone|Lil Wayne|Nas|Biggie|Tupac|Weeknd|Frank Ocean|Childish Gambino|Chance|Logic|Joyner|Big Sean|Pusha|Meek Mill|21 Savage|Lil Baby|DaBaby|Roddy|Polo G|Lil Durk|Pop Smoke|Juice WRLD|XXXTentacion|Ski Mask|Denzel Curry|JID|Earthgang|Ari Lennox|SZA|Summer Walker|Doja Cat|Megan Thee Stallion|Cardi B|City Girls|Saweetie|Bia|Rico Nasty|Rapsody|Noname|Smino|Saba|Vince Staples|Isaiah Rashad|Ab-Soul|ScHoolboy Q|Jay Rock|Danny Brown|Earl Sweatshirt|Action Bronson|Joey Badass|Capital Steez|Beast Coast|Flatbush Zombies|Underachievers|Pro Era/, $options: 'i' } }
          ],
          $and: [
            { decayAt: { $exists: false } },
            { decayAt: { $gt: new Date() } }
          ]
        }).limit(20).lean();
        
        // Extract artist names from memory content using simple parsing
        const extractedArtists = [];
        artistMemories.forEach(memory => {
          const content = memory.content.toLowerCase();
          // Look for common patterns like "I love Drake" or "listening to J. Cole"
          const artistPatterns = [
            /(?:love|like|listen to|fan of|favorite|enjoy)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)/gi,
            /([A-Z][a-z]+(?:\s+[A-Z][a-z]*)*)\s+(?:is|was|makes|dropped|released)/gi
          ];
          
          artistPatterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
              matches.forEach(match => {
                const artistName = match.replace(/(?:love|like|listen to|fan of|favorite|enjoy|is|was|makes|dropped|released)/gi, '').trim();
                if (artistName.length > 2 && artistName.length < 50) {
                  extractedArtists.push(artistName);
                }
              });
            }
          });
        });
        
        artistNames = [...new Set(extractedArtists)].slice(0, 5); // Dedupe and limit
        
        if (artistNames.length === 0) {
          log.info('No artists found in user memories or followed list - using general trending content');
          artistNames = ['hip-hop', 'rap', 'music']; // Use genre terms instead of specific artists
        }
      } catch (error) {
        log.error('Error extracting artists from memories:', error);
        artistNames = ['hip-hop', 'rap', 'music']; // Safe fallback to genre terms
      }
    }

    // Choose aggregator based on cost settings
    const useFreeMode = !env.SERPAPI_API_KEY || env.USE_FREE_NEWS_MODE === 'true';
    
    const trendingItems = useFreeMode 
      ? await freeNewsAggregator.getTrendingFromReddit(artistNames, parseInt(limit))
      : await liveNewsAggregator.getTrendingContent(artistNames, parseInt(limit));

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