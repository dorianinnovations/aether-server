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

// Get live personalized feed - LATEST: Recent activity + current favorites
router.get('/timeline', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('🎯 Live feed request (LATEST)', { userId: req.user.id, limit });

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    console.log('[DEBUG] User music profile check:', {
      userId: req.user.id,
      hasMusicProfile: !!user?.musicProfile,
      hasSpotify: !!user?.musicProfile?.spotify,
      spotifyKeys: user?.musicProfile?.spotify ? Object.keys(user.musicProfile.spotify) : [],
      recentTracksCount: user?.musicProfile?.spotify?.recentTracks?.length || 0,
      topTracksCount: user?.musicProfile?.spotify?.topTracks?.length || 0
    });
    
    if (!user?.musicProfile?.spotify) {
      return res.json({
        success: true,
        data: [],
        message: 'Connect Spotify to see personalized content',
        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNextPage: false }
      });
    }

    // LATEST strategy: Focus on recent listening + current top tracks
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Prioritize recent tracks (last 20 from up to 50 stored)
    spotify.recentTracks?.slice(0, 20).forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add current top tracks for context
    spotify.topTracks?.slice(0, 15).forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Include some grails for breadth
    spotify.grails?.topTracks?.slice(0, 10).forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    const followedArtists = Array.from(artistSet).map(artistName => ({
      name: artistName,
      id: artistName.toLowerCase().replace(/\s+/g, '_')
    }));
    
    console.log('[DEBUG] Artist extraction result:', {
      artistSetSize: artistSet.size,
      followedArtistsCount: followedArtists.length,
      sampleArtists: followedArtists.slice(0, 5).map(a => a.name)
    });
    
    if (followedArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No artists found in your Spotify data. Play some music to see personalized content',
        pagination: { currentPage: 1, totalPages: 0, totalItems: 0, hasNextPage: false }
      });
    }

    // Force free mode to get full article content via scraping
    const useFreeMode = true; // Always use free mode for full content scraping
    
    log.info(`📰 Using ${useFreeMode ? 'FREE' : 'PAID'} news aggregator`);
    
    const feedItems = useFreeMode 
      ? await freeNewsAggregator.getPersonalizedFeedFree(followedArtists, 'timeline', parseInt(limit))
      : await liveNewsAggregator.getPersonalizedFeed(followedArtists, 'timeline', parseInt(limit));

    console.log('[DEBUG] News aggregator result:', {
      feedItemsLength: feedItems?.length || 0,
      feedItemsType: typeof feedItems,
      firstItemKeys: feedItems?.[0] ? Object.keys(feedItems[0]) : []
    });

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

// Get live releases feed - RELEASES: Focus on grails and top artists
router.get('/releases', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('🎵 Live releases request (GRAILS + TOP)', { userId: req.user.id, limit });

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

    // RELEASES strategy: Focus heavily on top artists and grails
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Prioritize top tracks first (your current heavy rotation)
    spotify.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add ALL grails - your all-time favorites
    spotify.grails?.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    spotify.grails?.topAlbums?.forEach(album => {
      if (album.artist) artistSet.add(album.artist);
    });
    
    // Add recent tracks for current activity context
    spotify.recentTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
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

    // Force free mode to get full article content via scraping
    const useFreeMode = true; // Always use free mode for full content scraping
    
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

// Get live news feed - DEEP CUTS: Focus on deeper listening history
router.get('/news', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('📰 Live news request (DEEP CUTS)', { userId: req.user.id, limit });

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

    // DEEP CUTS strategy: Broader catalog, older listening history
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Start with ALL grails for maximum depth
    spotify.grails?.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    spotify.grails?.topAlbums?.forEach(album => {
      if (album.artist) artistSet.add(album.artist);
    });
    
    // Add ALL recent tracks for full breadth
    spotify.recentTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add ALL top tracks
    spotify.topTracks?.forEach(track => {
      if (track.artist) artistSet.add(track.artist);
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

    // Force free mode to get full article content via scraping
    const useFreeMode = true; // Always use free mode for full content scraping
    
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

// Add tours endpoint for comprehensive coverage
router.get('/tours', protect, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    log.info('🎤 Live tours request (CURRENT ROTATION)', { userId: req.user.id, limit });

    // Get user's music profile data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.musicProfile?.spotify) {
      return res.json({
        success: true,
        data: [],
        message: 'Connect Spotify to see tours from your music'
      });
    }

    // TOURS strategy: Current rotation + top tracks (artists you're actively listening to)
    const artistSet = new Set();
    const spotify = user.musicProfile.spotify;
    
    // Focus on very recent activity (last 15 tracks)
    spotify.recentTracks?.slice(0, 15).forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    // Add current top tracks
    spotify.topTracks?.slice(0, 25).forEach(track => {
      if (track.artist) artistSet.add(track.artist);
    });
    
    const followedArtists = Array.from(artistSet).map(artistName => ({
      name: artistName,
      id: artistName.toLowerCase().replace(/\s+/g, '_')
    }));
    
    if (followedArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No artists found in your Spotify data. Play some music to see tours'
      });
    }

    // Force free mode to get full article content via scraping
    const useFreeMode = true; // Always use free mode for full content scraping
    
    // Get live tours/events
    const feedItems = useFreeMode 
      ? await freeNewsAggregator.getPersonalizedFeedFree(followedArtists, 'tours', parseInt(limit))
      : await liveNewsAggregator.getPersonalizedFeed(followedArtists, 'tours', parseInt(limit));

    const transformedItems = feedItems.map(item => ({
      id: item.id,
      artistId: item.artistName,
      artist: {
        name: item.artistName,
        image: item.imageUrl
      },
      type: 'tour',
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
        contentType: 'tours',
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('Live tours error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load live tours' 
    });
  }
});

// Get trending content - TRENDING: What's hot with your taste right now
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

    // Force free mode to get full article content via scraping
    const useFreeMode = true; // Always use free mode for full content scraping
    
    // REDDIT DISABLED - Only using NewsAPI for targeted content
    const trendingItems = [];

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

// Get full article content for reading
router.get('/article/:articleId', protect, async (req, res) => {
  try {
    const { articleId } = req.params;
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Article URL is required'
      });
    }

    log.info('📖 Full article content request', { 
      userId: req.user.id, 
      articleId,
      url: url.substring(0, 100) + '...'
    });

    // Import the aggregator to use its scraping method
    const freeNewsAggregator = (await import('../services/freeNewsAggregator.js')).default;
    
    // Scrape full article content
    const fullContent = await freeNewsAggregator.scrapeFullArticleContent(url);
    
    if (fullContent && fullContent.content) {
      res.json({
        success: true,
        data: {
          articleId,
          url,
          content: fullContent.content,
          imageUrl: fullContent.imageUrl,
          scrapedAt: new Date().toISOString(),
          wordCount: fullContent.content.split(' ').length
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          articleId,
          url,
          content: 'Full article content could not be extracted from this source.',
          imageUrl: null,
          scrapedAt: new Date().toISOString(),
          wordCount: 0
        }
      });
    }

  } catch (error) {
    log.error('Full article content error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load full article content'
    });
  }
});

export default router;