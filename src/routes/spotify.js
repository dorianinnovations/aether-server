import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import spotifyService from '../services/spotifyService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get Spotify authorization URL
router.get('/auth', protect, async (req, res) => {
  try {
    const authUrl = spotifyService.getAuthUrl(req.user.id);
    
    res.json({
      success: true,
      authUrl,
      message: 'Visit this URL to connect your Spotify account'
    });
  } catch (error) {
    log.error('Spotify auth URL generation error:', error);
    res.status(500).json({ error: 'Failed to generate Spotify auth URL' });
  }
});

// Handle Spotify callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId, error } = req.query;
    
    if (error) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=${error}`);
    }

    if (!code || !userId) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=missing_params`);
    }

    // Exchange code for tokens
    const tokens = await spotifyService.exchangeCodeForTokens(code);
    
    // Update user with Spotify connection
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=user_not_found`);
    }

    user.socialProxy.spotify = {
      connected: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken
    };

    await user.save();

    // Initial data fetch
    await spotifyService.updateUserSpotifyData(user);

    // Create activity for connecting Spotify
    await Activity.create({
      user: user._id,
      type: 'profile_update',
      content: { text: 'Connected Spotify account' },
      visibility: 'friends'
    });

    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_connected=true`);
  } catch (error) {
    log.error('Spotify callback error:', error);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=connection_failed`);
  }
});

// Disconnect Spotify
router.post('/disconnect', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Clear Spotify data
    user.socialProxy.spotify = {
      connected: false,
      accessToken: null,
      refreshToken: null,
      currentTrack: {},
      recentTracks: [],
      topTracks: []
    };

    await user.save();

    res.json({
      success: true,
      message: 'Spotify disconnected successfully'
    });
  } catch (error) {
    log.error('Spotify disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect Spotify' });
  }
});

// Get current Spotify status
router.get('/status', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('socialProxy.spotify');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update Spotify data if connected
    if (user.socialProxy?.spotify?.connected) {
      await spotifyService.updateUserSpotifyData(user);
      await user.reload(); // Refresh user data
    }

    res.json({
      success: true,
      spotify: user.socialProxy?.spotify || { connected: false }
    });
  } catch (error) {
    log.error('Get Spotify status error:', error);
    res.status(500).json({ error: 'Failed to get Spotify status' });
  }
});

// Manually refresh Spotify data
router.post('/refresh', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.socialProxy?.spotify?.connected) {
      return res.status(400).json({ error: 'Spotify not connected' });
    }

    const success = await spotifyService.updateUserSpotifyData(user);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to refresh Spotify data' });
    }

    // Check if there's a new current track to share
    const currentTrack = user.socialProxy.spotify.currentTrack;
    if (currentTrack && currentTrack.name) {
      // Create activity for current track (optional - could be too spammy)
      const recentTrackActivity = await Activity.findOne({
        user: user._id,
        type: 'spotify_track',
        'content.metadata.track.name': currentTrack.name,
        'content.metadata.track.artist': currentTrack.artist,
        createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Within last 30 minutes
      });

      // Only create activity if this track wasn't shared recently
      if (!recentTrackActivity) {
        await Activity.create({
          user: user._id,
          type: 'spotify_track',
          content: {
            text: `Currently listening to "${currentTrack.name}" by ${currentTrack.artist}`,
            metadata: {
              track: currentTrack
            }
          },
          visibility: 'friends'
        });
      }
    }

    res.json({
      success: true,
      message: 'Spotify data refreshed successfully',
      spotify: user.socialProxy.spotify
    });
  } catch (error) {
    log.error('Refresh Spotify data error:', error);
    res.status(500).json({ error: 'Failed to refresh Spotify data' });
  }
});

// Share a specific track
router.post('/share-track', protect, async (req, res) => {
  try {
    const { trackName, artist, album, imageUrl, spotifyUrl, message } = req.body;
    
    if (!trackName || !artist) {
      return res.status(400).json({ error: 'Track name and artist are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create activity for shared track
    await Activity.create({
      user: user._id,
      type: 'spotify_discovery',
      content: {
        text: message || `Check out "${trackName}" by ${artist}`,
        metadata: {
          track: {
            name: trackName,
            artist,
            album,
            imageUrl,
            spotifyUrl
          }
        }
      },
      visibility: 'friends'
    });

    res.json({
      success: true,
      message: 'Track shared successfully'
    });
  } catch (error) {
    log.error('Share track error:', error);
    res.status(500).json({ error: 'Failed to share track' });
  }
});

export default router;