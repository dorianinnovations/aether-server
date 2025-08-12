import express from 'express';
import { protect } from '../middleware/auth.js';
import artistDiscoveryService from '../services/artistDiscoveryService.js';
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

export default router;