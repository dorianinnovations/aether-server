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

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.musicProfile?.spotify) {
      return res.json({
        success: true,
        data: [],
        message: 'Connect Spotify to see personalized content',
        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNextPage: false }
      });
    }

    // Extract artists from musicProfile.spotify data
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Add artists from recent tracks
    spotify.recentTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from top tracks
    spotify.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top tracks)
    spotify.grails?.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top albums)
    spotify.grails?.topAlbums?.forEach(album => {
      if (album.artist) artistSet.add(album.artist);
    });
    
    const followedArtists = Array.from(artistSet).map(artistName => ({
      name: artistName,
      id: artistName.toLowerCase().replace(/\s+/g, '_')
    }));
    
    if (followedArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No artists found in your Spotify data. Play some music to see personalized content',
        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNextPage: false }
      });
    }

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

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.musicProfile?.spotify) {
      return res.json({
        success: true,
        data: [],
        message: 'Connect Spotify to see releases from your music'
      });
    }

    // Extract artists from musicProfile.spotify data
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Add artists from recent tracks
    spotify.recentTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from top tracks
    spotify.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top tracks)
    spotify.grails?.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top albums)
    spotify.grails?.topAlbums?.forEach(album => {
      if (album.artist) artistSet.add(album.artist);
    });
    
    const followedArtists = Array.from(artistSet).map(artistName => ({
      name: artistName,
      id: artistName.toLowerCase().replace(/\s+/g, '_')
    }));
    
    if (followedArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No artists found in your Spotify data. Play some music to see releases'
      });
    }

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

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.musicProfile?.spotify) {
      return res.json({
        success: true,
        data: [],
        message: 'Connect Spotify to see news about your music'
      });
    }

    // Extract artists from musicProfile.spotify data
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Add artists from recent tracks
    spotify.recentTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from top tracks
    spotify.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top tracks)
    spotify.grails?.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add artists from grails (top albums)
    spotify.grails?.topAlbums?.forEach(album => {
      if (album.artist) artistSet.add(album.artist);
    });
    
    const followedArtists = Array.from(artistSet).map(artistName => ({
      name: artistName,
      id: artistName.toLowerCase().replace(/\s+/g, '_')
    }));
    
    if (followedArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No artists found in your Spotify data. Play some music to see news'
      });
    }

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

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);

    // Extract artists from musicProfile.spotify data
    let artistNames = [];
    
    if (user?.musicProfile?.spotify) {
      const artistSet = new Set();
      const spotify = user.musicProfile.spotify;
      
      // Add artists from recent tracks
      spotify.recentTracks?.forEach(track => {
        if (track.artist) artistSet.add(track.artist);
      });
      
      // Add artists from top tracks
      spotify.topTracks?.forEach(track => {
        if (track.artist) artistSet.add(track.artist);
      });
      
      // Add artists from grails (top tracks)
      spotify.grails?.topTracks?.forEach(track => {
        if (track.artist) artistSet.add(track.artist);
      });
      
      // Add artists from grails (top albums)
      spotify.grails?.topAlbums?.forEach(album => {
        if (album.artist) artistSet.add(album.artist);
      });
      
      artistNames = Array.from(artistSet);
    }
    
    if (artistNames.length === 0) {
      log.info('No artists found in Spotify data - using general trending content');
      artistNames = ['hip-hop', 'rap', 'music']; // Use genre terms instead of specific artists
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

// Follow artist endpoint removed - feed uses musicProfile.spotify data only

export default router;