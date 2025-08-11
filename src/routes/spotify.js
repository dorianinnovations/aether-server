import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import spotifyService from '../services/spotifyService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Debug endpoint (remove after testing)
router.get('/debug-config', (req, res) => {
  res.json({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    hasSecret: !!process.env.SPOTIFY_CLIENT_SECRET
  });
});

// Get Spotify authorization URL
router.get('/auth', protect, async (req, res) => {
  try {
    // Check if this is for mobile (Expo) or web
    const platform = req.query.platform || 'web';
    
    // Debug logging
    log.info('Spotify auth request:', {
      platform,
      userId: req.user.id,
      hasSpotifyService: !!spotifyService,
      spotifyConfig: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        hasSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        redirectUriEnv: process.env.SPOTIFY_REDIRECT_URI,
        redirectUriFromService: spotifyService.getRedirectUri(platform)
      }
    });

    const authUrl = spotifyService.getAuthUrl(req.user.id, platform);
    
    res.json({
      success: true,
      authUrl,
      message: 'Visit this URL to connect your Spotify account',
      debug: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        redirectUri: spotifyService.getRedirectUri(platform),
        hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        platform
      }
    });
  } catch (error) {
    log.error('Spotify auth URL generation error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate Spotify auth URL',
      message: error.message,
      stack: error.stack
    });
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

    // Exchange code for tokens (web platform)
    const tokens = await spotifyService.exchangeCodeForTokens(code, 'web');
    
    // Update user with Spotify connection
    const user = await User.findById(userId);
    if (!user) {
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=user_not_found`);
    }

    log.info('Spotify callback - User before update:', {
      userId: user._id,
      hasMusicProfile: !!user.musicProfile,
      musicProfileType: typeof user.musicProfile
    });

    // Initialize musicProfile if it doesn't exist
    if (!user.musicProfile) {
      user.musicProfile = {};
      log.info('Initialized empty musicProfile');
    }
    if (!user.musicProfile.spotify) {
      user.musicProfile.spotify = {};
      log.info('Initialized empty spotify object');
    }

    user.musicProfile.spotify.connected = true;
    user.musicProfile.spotify.accessToken = tokens.accessToken;
    user.musicProfile.spotify.refreshToken = tokens.refreshToken;

    await user.save();

    // Initial data fetch
    await spotifyService.updateUserSpotifyData(user);

    // Log Spotify connection for analytics
    log.info('User connected Spotify', { userId: user._id, username: user.username });

    res.send(`
      <html>
        <head>
          <title>Spotify Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              text-align: center;
              padding: 40px 20px;
              background: linear-gradient(135deg, #1DB954, #1ed760);
              color: white;
              margin: 0;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }
            .container {
              max-width: 400px;
              margin: 0 auto;
            }
            h1 { margin-bottom: 20px; font-size: 24px; }
            p { margin-bottom: 30px; font-size: 16px; opacity: 0.9; }
            .success-icon { font-size: 64px; margin-bottom: 20px; }
            .button {
              background: rgba(255,255,255,0.2);
              border: 2px solid rgba(255,255,255,0.3);
              color: white;
              padding: 12px 24px;
              border-radius: 25px;
              text-decoration: none;
              font-size: 16px;
              font-weight: 600;
              display: inline-block;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="success-icon">🎵</div>
            <h1>Spotify Connected!</h1>
            <p>Your Spotify account has been successfully connected to Aether.</p>
            <p>You can now close this window and return to the app.</p>
            <a href="#" class="button" onclick="window.close(); return false;">Close Window</a>
          </div>
          <script>
            // Auto-close after 5 seconds
            setTimeout(() => {
              window.close();
            }, 5000);
            
            // Post message to parent window (for mobile web views)
            if (window.parent !== window) {
              window.parent.postMessage('spotify-connected', '*');
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    log.error('Spotify callback error:', error);
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/profile?spotify_error=connection_failed`);
  }
});

// Handle mobile callback (for Expo app)
router.post('/mobile-callback', async (req, res) => {
  try {
    const { code, state: userId, error } = req.body;
    
    if (error) {
      return res.json({ 
        success: false, 
        error: error,
        message: 'Spotify authorization failed'
      });
    }

    if (!code || !userId) {
      return res.json({ 
        success: false, 
        error: 'missing_params',
        message: 'Missing authorization code or user ID'
      });
    }

    // Exchange code for tokens (mobile platform)
    const tokens = await spotifyService.exchangeCodeForTokens(code, 'mobile');
    
    // Update user with Spotify connection
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ 
        success: false, 
        error: 'user_not_found',
        message: 'User not found'
      });
    }

    // Initialize musicProfile if it doesn't exist
    if (!user.musicProfile) {
      user.musicProfile = {};
    }
    if (!user.musicProfile.spotify) {
      user.musicProfile.spotify = {};
    }

    user.musicProfile.spotify.connected = true;
    user.musicProfile.spotify.accessToken = tokens.accessToken;
    user.musicProfile.spotify.refreshToken = tokens.refreshToken;

    await user.save();

    // Initial data fetch
    await spotifyService.updateUserSpotifyData(user);

    // Log Spotify connection for analytics
    log.info('User connected Spotify', { userId: user._id, username: user.username });

    res.json({
      success: true,
      message: 'Spotify connected successfully'
    });
  } catch (error) {
    log.error('Spotify mobile callback error:', error);
    res.json({ 
      success: false, 
      error: 'connection_failed',
      message: 'Failed to connect Spotify account'
    });
  }
});

// Disconnect Spotify
router.post('/disconnect', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Initialize and clear Spotify data
    if (!user.musicProfile) {
      user.musicProfile = {};
    }
    if (!user.musicProfile.spotify) {
      user.musicProfile.spotify = {};
    }
    
    user.musicProfile.spotify.connected = false;
    user.musicProfile.spotify.accessToken = null;
    user.musicProfile.spotify.refreshToken = null;
    user.musicProfile.spotify.currentTrack = {};
    user.musicProfile.spotify.recentTracks = [];
    user.musicProfile.spotify.topTracks = [];

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
    const user = await User.findById(req.user.id).select('musicProfile.spotify');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update Spotify data if connected
    if (user.musicProfile?.spotify?.connected) {
      await spotifyService.updateUserSpotifyData(user);
      // Re-fetch user data after update
      const updatedUser = await User.findById(req.user.id).select('musicProfile.spotify');
      user.musicProfile = updatedUser.musicProfile;
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

    if (!user.musicProfile?.spotify?.connected) {
      return res.status(400).json({ error: 'Spotify not connected' });
    }

    const success = await spotifyService.updateUserSpotifyData(user);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to refresh Spotify data' });
    }

    // Check if there's a new current track to share
    const currentTrack = user.musicProfile.spotify.currentTrack;
    if (currentTrack && currentTrack.name) {
      // Check if we recently logged this track to avoid duplicates
      const recentActivities = user.musicProfile?.musicPersonality?.recentMusicActivities || [];
      const hasRecentTrack = recentActivities.some(activity => 
        activity.activity.includes(currentTrack.name) && 
        activity.activity.includes(currentTrack.artist) &&
        (Date.now() - new Date(activity.detectedAt).getTime()) < 30 * 60 * 1000 // 30 minutes
      );

      // Update music profile with current listening data for artist recommendations
      if (!hasRecentTrack) {
        // Initialize music profile if needed
        if (!user.musicProfile) user.musicProfile = {};
        if (!user.musicProfile.musicPersonality) user.musicProfile.musicPersonality = {};
        if (!user.musicProfile.musicPersonality.recentMusicActivities) {
          user.musicProfile.musicPersonality.recentMusicActivities = [];
        }
        
        // Add listening activity for artist discovery
        user.musicProfile.musicPersonality.recentMusicActivities.unshift({
          activity: `Currently listening to "${currentTrack.name}" by ${currentTrack.artist}`,
          type: 'listening',
          confidence: 0.8,
          detectedAt: new Date()
        });
        
        // Keep only last 20 activities
        user.musicProfile.musicPersonality.recentMusicActivities = 
          user.musicProfile.musicPersonality.recentMusicActivities.slice(0, 20);
        
        user.musicProfile.lastUpdated = new Date();
        await user.save();
      }
    }

    res.json({
      success: true,
      message: 'Spotify data refreshed successfully',
      spotify: user.musicProfile.spotify
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

    // Log track sharing for analytics (no social timeline needed)
    log.info('User shared track', { 
      userId: user._id, 
      trackName, 
      artist, 
      hasMessage: !!message 
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

// Get live Spotify status for a specific user (friends only)
router.get('/live-status/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    const requestingUserId = req.user.id;
    
    // Find the target user
    const targetUser = await User.findOne({ username }).select('_id username musicProfile.spotify friends');
    
    if (!targetUser) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Check if the requesting user is friends with the target user
    const isFriend = targetUser.friends.some(friend => 
      friend.user.toString() === requestingUserId
    );

    const requestingUser = await User.findById(requestingUserId).select('friends');
    const isRequestingUserFriend = requestingUser?.friends.some(friend => 
      friend.user.toString() === targetUser._id.toString()
    );

    if (!isFriend || !isRequestingUserFriend) {
      return res.status(403).json({ 
        success: false,
        error: 'You can only view Spotify status of friends' 
      });
    }

    // Check if target user has Spotify connected
    if (!targetUser.socialProxy?.spotify?.connected) {
      return res.json({
        success: true,
        connected: false,
        message: `${username} hasn't connected Spotify`,
        username: targetUser.username
      });
    }

    // Try to get fresh live status
    let liveData = null;
    let statusAge = null;

    try {
      // Update their Spotify data to get live status
      const updateSuccess = await spotifyService.updateUserSpotifyData(targetUser);
      
      if (updateSuccess) {
        const currentTrack = targetUser.musicProfile.spotify.currentTrack;
        
        if (currentTrack && currentTrack.name) {
          // Calculate how old this status is
          statusAge = currentTrack.lastPlayed ? 
            Math.floor((Date.now() - new Date(currentTrack.lastPlayed).getTime()) / 1000) : 
            null;

          liveData = {
            currentTrack: {
              name: currentTrack.name,
              artist: currentTrack.artist,
              album: currentTrack.album,
              imageUrl: currentTrack.imageUrl,
              spotifyUrl: currentTrack.spotifyUrl,
              isPlaying: currentTrack.isPlaying,
              progressMs: currentTrack.progressMs,
              durationMs: currentTrack.durationMs
            },
            lastUpdated: currentTrack.lastPlayed,
            statusAgeSeconds: statusAge
          };
        }
      }
    } catch (error) {
      log.warn(`Failed to get live Spotify status for ${username}:`, error.message);
      // Fall back to cached data
    }

    // If no live data, get cached recent tracks
    let recentActivity = null;
    if (!liveData) {
      const recentTracks = targetUser.musicProfile.spotify.recentTracks;
      if (recentTracks && recentTracks.length > 0) {
        const mostRecent = recentTracks[0];
        recentActivity = {
          recentTrack: {
            name: mostRecent.name,
            artist: mostRecent.artist,
            album: mostRecent.album,
            imageUrl: mostRecent.imageUrl,
            spotifyUrl: mostRecent.spotifyUrl,
            playedAt: mostRecent.playedAt
          },
          type: 'recent'
        };
      }
    }

    res.json({
      success: true,
      connected: true,
      username: targetUser.username,
      live: liveData,
      recent: recentActivity,
      topTracks: targetUser.musicProfile.spotify.topTracks?.slice(0, 3) || [],
      lastRefreshed: new Date().toISOString()
    });

  } catch (error) {
    log.error('Get live Spotify status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get live Spotify status' 
    });
  }
});

export default router;