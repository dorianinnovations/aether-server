/**
 * Multi-Source Artist News - Underground + Mainstream Coverage
 * Gets news for YOUR recently played artists from multiple sources
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import multiSourceNews from '../services/multiSourceNews.js';
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

    // Use multi-source news system
    const sortedNews = await multiSourceNews.getArtistNews(recentArtists, parseInt(limit));

    console.log(`[ARTIST-NEWS] Returning ${sortedNews.length} articles for ${recentArtists.length} artists`);

    res.json({
      success: true,
      data: sortedNews,
      meta: {
        artistsSearched: recentArtists,
        totalArticles: sortedNews.length,
        lastUpdated: new Date().toISOString()
      },
      sourcesUsed: ['Genius', 'Last.fm', 'HotNewHipHop']
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