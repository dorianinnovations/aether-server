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
      // Don't log token expiration errors - they're expected and handled upstream
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get current track:', error);
      throw error;
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
        id: item.track.id,
        name: item.track.name,
        artist: item.track.artists.map(a => a.name).join(', '),
        album: item.track.album.name,
        imageUrl: item.track.album.images[0]?.url,
        spotifyUrl: item.track.external_urls.spotify,
        playedAt: new Date(item.played_at)
      }));
    } catch (error) {
      // Don't log token expiration errors - they're expected and handled upstream
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
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
        id: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images[0]?.url,
        spotifyUrl: track.external_urls.spotify,
        timeRange
      }));
    } catch (error) {
      // Don't log token expiration errors - they're expected and handled upstream
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get top tracks:', error);
      return [];
    }
  }

  // Update user's Spotify data
  async updateUserSpotifyData(user) {
    if (!user.musicProfile?.spotify?.connected || !user.musicProfile.spotify.accessToken) {
      return false;
    }

    try {
      let accessToken = user.musicProfile.spotify.accessToken;
      let tokenRefreshed = false;

      // Helper function to attempt API call with token refresh if needed
      const makeSpotifyCall = async (apiCall) => {
        try {
          return await apiCall(accessToken);
        } catch (error) {
          // If token expired and we haven't tried refreshing yet, try once
          if (error.message === 'SPOTIFY_TOKEN_EXPIRED' && !tokenRefreshed && user.musicProfile.spotify.refreshToken) {
            try {
              const tokens = await this.refreshAccessToken(user.musicProfile.spotify.refreshToken);
              user.musicProfile.spotify.accessToken = tokens.accessToken;
              user.musicProfile.spotify.refreshToken = tokens.refreshToken;
              accessToken = tokens.accessToken;
              tokenRefreshed = true;
              
              // Retry the API call with new token
              return await apiCall(accessToken);
            } catch (refreshError) {
              // If refresh fails, throw the original token expiration error
              throw error;
            }
          }
          throw error;
        }
      };

      // Get updated data with automatic token refresh
      const [currentTrack, recentTracks, topTracks] = await Promise.all([
        makeSpotifyCall((token) => this.getCurrentTrack(token)),
        makeSpotifyCall((token) => this.getRecentTracks(token, 10)),
        makeSpotifyCall((token) => this.getTopTracks(token, 'short_term', 10))
      ]);

      // Update user data
      if (currentTrack) {
        user.musicProfile.spotify.currentTrack = {
          ...currentTrack,
          // Only update lastPlayed if track actually changed or if it was just started
          lastPlayed: (user.musicProfile.spotify.currentTrack?.name !== currentTrack.name || 
                      user.musicProfile.spotify.currentTrack?.artist !== currentTrack.artist) 
                     ? new Date() 
                     : user.musicProfile.spotify.currentTrack?.lastPlayed || new Date()
        };
      } else {
        // If nothing is currently playing, use the most recent track but mark it as not playing
        if (recentTracks && recentTracks.length > 0) {
          const mostRecent = recentTracks[0];
          user.musicProfile.spotify.currentTrack = {
            name: mostRecent.name,
            artist: mostRecent.artist,
            album: mostRecent.album,
            imageUrl: mostRecent.imageUrl,
            spotifyUrl: mostRecent.spotifyUrl,
            isPlaying: false,
            progressMs: null,
            durationMs: null,
            lastPlayed: mostRecent.playedAt
          };
        } else {
          user.musicProfile.spotify.currentTrack = null;
        }
      }

      user.musicProfile.spotify.recentTracks = recentTracks;
      user.musicProfile.spotify.topTracks = topTracks;

      await user.save();
      
      if (tokenRefreshed) {
        log.debug(`Refreshed token and updated Spotify data for user ${user.username}`);
      }
      return true;

    } catch (error) {
      // Propagate token expiration errors to calling service for proper handling
      if (error.message?.includes('SPOTIFY_TOKEN_EXPIRED')) {
        throw error; // Let the calling service (spotifyLiveService) handle it
      }
      
      log.error(`Failed to update Spotify data for user ${user.username}:`, error);
      
      // If refresh failed, disconnect Spotify
      if (error.message.includes('refresh')) {
        user.musicProfile.spotify.connected = false;
        user.musicProfile.spotify.accessToken = null;
        user.musicProfile.spotify.refreshToken = null;
        await user.save();
      }
      
      return false;
    }
  }

  // Get audio features for tracks
  async getAudioFeatures(accessToken, trackIds) {
    try {
      // Convert single ID to array for consistency
      const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
      const idsParam = ids.join(',');
      
      const response = await fetch(`${this.baseUrl}/audio-features?ids=${idsParam}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED');
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      return Array.isArray(trackIds) ? data.audio_features : data.audio_features[0];
    } catch (error) {
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get audio features:', error);
      throw error;
    }
  }

  // Get detailed track information including audio features
  async getTrackWithFeatures(accessToken, trackId) {
    try {
      const [trackResponse, featuresResponse] = await Promise.all([
        fetch(`${this.baseUrl}/tracks/${trackId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }),
        fetch(`${this.baseUrl}/audio-features/${trackId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })
      ]);

      if (trackResponse.status === 401 || featuresResponse.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED');
      }

      const [track, features] = await Promise.all([
        trackResponse.json(),
        featuresResponse.json()
      ]);

      return {
        ...track,
        audioFeatures: features
      };
    } catch (error) {
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get track with features:', error);
      throw error;
    }
  }

  // Enhanced method to get recent tracks with audio features
  async getRecentTracksWithFeatures(accessToken, limit = 10) {
    try {
      const recentTracks = await this.getRecentTracks(accessToken, limit);
      
      if (!recentTracks || recentTracks.length === 0) {
        return [];
      }

      // Extract track IDs for audio features batch request
      const trackIds = recentTracks.map(track => track.id).filter(Boolean);

      if (trackIds.length === 0) {
        return recentTracks;
      }

      const audioFeatures = await this.getAudioFeatures(accessToken, trackIds);
      
      // Merge audio features with track data
      return recentTracks.map((track, index) => ({
        ...track,
        audioFeatures: audioFeatures[index] || null
      }));

    } catch (error) {
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get recent tracks with features:', error);
      return [];
    }
  }

  // Enhanced method to get top tracks with audio features
  async getTopTracksWithFeatures(accessToken, timeRange = 'medium_term', limit = 20) {
    try {
      const topTracks = await this.getTopTracks(accessToken, timeRange, limit);
      
      if (!topTracks || topTracks.length === 0) {
        return [];
      }

      // Extract track IDs for audio features batch request
      const trackIds = topTracks.map(track => track.id).filter(Boolean);

      if (trackIds.length === 0) {
        return topTracks;
      }

      const audioFeatures = await this.getAudioFeatures(accessToken, trackIds);
      
      // Merge audio features with track data
      return topTracks.map((track, index) => ({
        ...track,
        audioFeatures: audioFeatures[index] || null
      }));

    } catch (error) {
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to get top tracks with features:', error);
      return [];
    }
  }

  // Search for tracks, albums, artists, etc.
  async search(accessToken, query, type = 'track', limit = 20) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(`${this.baseUrl}/search?q=${encodedQuery}&type=${type}&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 401) {
        throw new Error('SPOTIFY_TOKEN_EXPIRED');
      }
      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.message === 'SPOTIFY_TOKEN_EXPIRED') {
        throw error;
      }
      log.error('Failed to search Spotify:', error);
      throw error;
    }
  }
}

export default new SpotifyService();