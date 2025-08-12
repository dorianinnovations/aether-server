/**
 * Simple Artist News - Clean implementation
 * Gets news for YOUR recently played artists only
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import fetch from 'node-fetch';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get news for your recently played artists
router.get('/', protect, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get user's Spotify data
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id);
    
    if (!user?.musicProfile?.spotify?.recentTracks) {
      return res.json({
        success: true,
        data: [],
        message: 'No recent Spotify tracks found'
      });
    }

    // Get unique artists from recent tracks (last 10 played)
    const recentArtists = [...new Set(
      user.musicProfile.spotify.recentTracks
        .slice(0, 10)
        .map(track => track.artist)
        .filter(artist => artist && artist.length > 1)
    )];

    console.log(`[ARTIST-NEWS] Searching for ${recentArtists.length} recent artists:`, recentArtists);

    if (recentArtists.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No recent artists found'
      });
    }

    // Search NewsAPI for each artist
    const allNews = [];
    
    if (process.env.NEWSAPI_KEY) {
      for (const artist of recentArtists.slice(0, 5)) { // Limit to 5 artists to avoid rate limits
        try {
          const searchQuery = `"${artist}" AND music`;
          const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&sortBy=publishedAt&pageSize=3&apiKey=${process.env.NEWSAPI_KEY}`;
          
          const response = await fetch(url);
          const data = await response.json();
          
          if (data.articles) {
            data.articles.forEach(article => {
              allNews.push({
                id: `news_${Date.now()}_${Math.random()}`,
                artist: artist,
                title: article.title,
                description: article.description,
                url: article.url,
                imageUrl: article.urlToImage,
                publishedAt: article.publishedAt,
                source: article.source?.name
              });
            });
          }
          
          console.log(`[ARTIST-NEWS] Found ${data.articles?.length || 0} articles for ${artist}`);
        } catch (error) {
          console.log(`[ARTIST-NEWS] Error searching for ${artist}:`, error.message);
        }
      }
    }

    // Sort by date and limit
    const sortedNews = allNews
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, parseInt(limit));

    console.log(`[ARTIST-NEWS] Returning ${sortedNews.length} articles for ${recentArtists.length} artists`);

    res.json({
      success: true,
      data: sortedNews,
      meta: {
        artistsSearched: recentArtists,
        totalArticles: sortedNews.length,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    log.error('Artist news error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get artist news' 
    });
  }
});

export default router;