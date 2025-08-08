import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import { log } from '../utils/logger.js';

class SpotifyService {
  constructor() {
    this.clientId = env.SPOTIFY_CLIENT_ID;
    this.clientSecret = env.SPOTIFY_CLIENT_SECRET;
    this.redirectUris = {
      web: env.SPOTIFY_REDIRECT_URI || 'https://aether-server-j5kh.onrender.com/spotify/callback',
      mobile: env.SPOTIFY_REDIRECT_URI || 'https://aether-server-j5kh.onrender.com/spotify/callback'
    };
    this.baseUrl = 'https://api.spotify.com/v1';
    this.authUrl = 'https://accounts.spotify.com';
    
    // Config loaded silently
  }

  // Get redirect URI based on platform
  getRedirectUri(platform = 'web') {
    return this.redirectUris[platform] || this.redirectUris.web;
  }

  // Generate Spotify authorization URL
  getAuthUrl(userId, platform = 'web') {
    // Validate required fields
    if (!this.clientId) {
      throw new Error('Spotify client ID not configured');
    }
    if (!userId) {
      throw new Error('User ID is required for Spotify auth');
    }

    const scopes = [
      'user-read-currently-playing',
      'user-read-recently-played',
      'user-top-read',
      'user-read-playback-state'
    ].join(' ');

    const redirectUri = this.getRedirectUri(platform);
    
    // Debug log
    console.log('Generating Spotify auth URL:', {
      userId,
      platform,
      redirectUri,
      clientId: this.clientId,
      scopes
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state: userId // Pass user ID to identify after callback
    });

    const authUrl = `${this.authUrl}/authorize?${params.toString()}`;
    console.log('Generated auth URL:', authUrl);
    
    return authUrl;
  }

  // Exchange authorization code for access token
  async exchangeCodeForTokens(code, platform = 'web') {
    try {
      const redirectUri = this.getRedirectUri(platform);
      const response = await fetch(`${this.authUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error_description || 'Failed to exchange code for tokens');
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in
      };
    } catch (error) {
      log.error('Spotify token exchange failed:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      const response = await fetch(`${this.authUrl}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error_description || 'Failed to refresh token');
      }

      return {
        accessToken: data.access_token,
        expiresIn: data.expires_in,
        refreshToken: data.refresh_token || refreshToken // Some responses don't include new refresh token
      };
    } catch (error) {
      log.error('Spotify token refresh failed:', error);
      throw error;
    }
  }

  // Get currently playing track
  async getCurrentTrack(accessToken) {
    try {
      const response = await fetch(`${this.baseUrl}/me/player/currently-playing`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 204) {
        return null; // No track currently playing
      }

      if (response.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED'); // Specific error for token refresh
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.item) return null;

      return {
        name: data.item.name,
        artist: data.item.artists.map(a => a.name).join(', '),
        album: data.item.album.name,
        imageUrl: data.item.album.images[0]?.url,
        spotifyUrl: data.item.external_urls.spotify,
        isPlaying: data.is_playing,
        progressMs: data.progress_ms,
        durationMs: data.item.duration_ms
      };
    } catch (error) {
      log.error('Failed to get current track:', error);
      return null;
    }
  }

  // Get recently played tracks
  async getRecentTracks(accessToken, limit = 10) {
    try {
      const response = await fetch(`${this.baseUrl}/me/player/recently-played?limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED'); // Specific error for token refresh
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.items.map(item => ({
        name: item.track.name,
        artist: item.track.artists.map(a => a.name).join(', '),
        album: item.track.album.name,
        imageUrl: item.track.album.images[0]?.url,
        spotifyUrl: item.track.external_urls.spotify,
        playedAt: new Date(item.played_at)
      }));
    } catch (error) {
      log.error('Failed to get recent tracks:', error);
      return [];
    }
  }

  // Get top tracks
  async getTopTracks(accessToken, timeRange = 'medium_term', limit = 20) {
    try {
      const response = await fetch(`${this.baseUrl}/me/top/tracks?time_range=${timeRange}&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED'); // Specific error for token refresh
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.items.map(track => ({
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images[0]?.url,
        spotifyUrl: track.external_urls.spotify,
        timeRange
      }));
    } catch (error) {
      log.error('Failed to get top tracks:', error);
      return [];
    }
  }

  // Update user's Spotify data
  async updateUserSpotifyData(user) {
    if (!user.socialProxy?.spotify?.connected || !user.socialProxy.spotify.accessToken) {
      return false;
    }

    try {
      let accessToken = user.socialProxy.spotify.accessToken;

      // Try to refresh token if needed (basic check)
      try {
        const currentTrack = await this.getCurrentTrack(accessToken);
        
        // If we get the track, token is still valid
        if (currentTrack !== null || currentTrack === null) {
          // Update current track
          user.socialProxy.spotify.currentTrack = currentTrack;
        }
      } catch (error) {
        // Token might be expired, try to refresh
        if (user.socialProxy.spotify.refreshToken) {
          const tokens = await this.refreshAccessToken(user.socialProxy.spotify.refreshToken);
          user.socialProxy.spotify.accessToken = tokens.accessToken;
          user.socialProxy.spotify.refreshToken = tokens.refreshToken;
          accessToken = tokens.accessToken;
        } else {
          throw error;
        }
      }

      // Get updated data
      const [currentTrack, recentTracks, topTracks] = await Promise.all([
        this.getCurrentTrack(accessToken),
        this.getRecentTracks(accessToken, 10),
        this.getTopTracks(accessToken, 'short_term', 10)
      ]);

      // Update user data
      if (currentTrack) {
        user.socialProxy.spotify.currentTrack = {
          ...currentTrack,
          lastPlayed: new Date()
        };
      }

      user.socialProxy.spotify.recentTracks = recentTracks;
      user.socialProxy.spotify.topTracks = topTracks;

      await user.save();
      
      log.info(`Updated Spotify data for user ${user.username}`);
      return true;

    } catch (error) {
      // Propagate token expiration errors to calling service for proper handling
      if (error.message?.includes('SPOTIFY_TOKEN_EXPIRED')) {
        throw error; // Let the calling service (spotifyLiveService) handle it
      }
      
      log.error(`Failed to update Spotify data for user ${user.username}:`, error);
      
      // If refresh failed, disconnect Spotify
      if (error.message.includes('refresh')) {
        user.socialProxy.spotify.connected = false;
        user.socialProxy.spotify.accessToken = null;
        user.socialProxy.spotify.refreshToken = null;
        await user.save();
      }
      
      return false;
    }
  }
}

export default new SpotifyService();