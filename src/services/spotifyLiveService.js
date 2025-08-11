/**
 * Spotify Live Service
 * Handles automatic background updates for live Spotify status
 */

import User from '../models/User.js';
import { log } from '../utils/logger.js';
import spotifyService from './spotifyService.js';
import notificationService from './notificationService.js';

class SpotifyLiveService {
  constructor() {
    this.updateInterval = null;
    this.updateFrequency = 30000; // 30 seconds
    this.isRunning = false;
    this.stats = {
      totalUpdates: 0,
      totalErrors: 0,
      activeUsers: 0,
      lastUpdateCycle: null
    };

    log.info('Spotify Live Service initialized');
  }

  /**
   * Start the background update service
   */
  start() {
    if (this.isRunning) {
      log.warn('Spotify Live Service already running');
      return;
    }

    this.isRunning = true;
    this.updateInterval = setInterval(() => {
      this.updateAllActiveUsers();
    }, this.updateFrequency);

    log.info(`Spotify Live Service started (updates every ${this.updateFrequency / 1000}s)`);
  }

  /**
   * Stop the background update service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.isRunning = false;
    log.info('Spotify Live Service stopped');
  }

  /**
   * Update Spotify data for all connected users
   */
  async updateAllActiveUsers() {
    try {
      // Find users with Spotify connected, populate friends
      const spotifyUsers = await User.find({
        'musicProfile.spotify.connected': true,
        'musicProfile.spotify.accessToken': { $exists: true, $ne: null }
      })
      .select('_id username musicProfile friends')
      .populate('friends.user', '_id');

      if (spotifyUsers.length === 0) {
        this.stats.activeUsers = 0;
        return;
      }

      this.stats.activeUsers = spotifyUsers.length;
      this.stats.lastUpdateCycle = new Date();

      log.debug(`🎵 Updating Spotify data for ${spotifyUsers.length} users`);

      // Update users in parallel with limited concurrency
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < spotifyUsers.length; i += batchSize) {
        batches.push(spotifyUsers.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(user => this.updateUserSpotifyStatus(user))
        );
      }

      log.debug(`✅ Spotify update cycle completed for ${spotifyUsers.length} users`);

    } catch (error) {
      log.error('Spotify update cycle failed:', error);
      this.stats.totalErrors++;
    }
  }

  /**
   * Update Spotify status for a single user
   */
  async updateUserSpotifyStatus(user) {
    try {
      // Check if user has Spotify configuration
      if (!user.musicProfile?.spotify) {
        return;
      }
      
      // Store previous track for comparison
      const previousTrack = user.musicProfile.spotify.currentTrack;
      const previousTrackId = previousTrack ? 
        `${previousTrack.name}-${previousTrack.artist}` : null;

      // Update Spotify data
      const success = await spotifyService.updateUserSpotifyData(user);
      
      if (!success) {
        return;
      }

      // Check if current track changed
      const currentTrack = user.musicProfile.spotify.currentTrack;
      const currentTrackId = currentTrack && currentTrack.name ? 
        `${currentTrack.name}-${currentTrack.artist}` : null;

      // Send notification and create activity if track changed and user is actively listening
      if (currentTrackId && currentTrackId !== previousTrackId) {
        // Only notify if the track is actually playing (not paused)
        if (currentTrack.isPlaying) {
          // Update user's music profile for better artist recommendations
          try {
            // Initialize music profile if needed
            if (!user.musicProfile) user.musicProfile = {};
            if (!user.musicProfile.musicPersonality) user.musicProfile.musicPersonality = {};
            if (!user.musicProfile.musicPersonality.recentMusicActivities) {
              user.musicProfile.musicPersonality.recentMusicActivities = [];
            }
            
            // Add recent listening activity for artist discovery
            user.musicProfile.musicPersonality.recentMusicActivities.unshift({
              activity: `Listening to ${currentTrack.name} by ${currentTrack.artist}`,
              type: 'listening',
              confidence: 0.8,
              detectedAt: new Date()
            });
            
            // Keep only last 20 activities for performance
            user.musicProfile.musicPersonality.recentMusicActivities = 
              user.musicProfile.musicPersonality.recentMusicActivities.slice(0, 20);
            
            // Update music interaction count
            user.musicProfile.musicPersonality.totalMusicInteractions = 
              (user.musicProfile.musicPersonality.totalMusicInteractions || 0) + 1;
            
            user.musicProfile.lastUpdated = new Date();
            await user.save();
            
            log.debug(`🎵 Updated music profile for ${user.username}: ${currentTrack.name} by ${currentTrack.artist}`);
          } catch (profileError) {
            log.error('Failed to update music profile:', profileError);
          }
          // Send notification to user and their friends
          const spotifyData = {
            type: 'track_change',
            username: user.username,
            currentTrack: {
              name: currentTrack.name,
              artist: currentTrack.artist,
              album: currentTrack.album,
              imageUrl: currentTrack.imageUrl,
              spotifyUrl: currentTrack.spotifyUrl
            },
            previousTrack: previousTrack ? {
              name: previousTrack.name,
              artist: previousTrack.artist
            } : null
          };

          // Notify the user themselves
          const sentToUser = notificationService.notifySpotifyUpdate(user._id.toString(), spotifyData);
          
          // Notify their friends about the track change
          if (user.friends && user.friends.length > 0) {
            for (const friend of user.friends) {
              if (friend.status === 'accepted') {
                const sentToFriend = notificationService.notifyUser(friend.user.toString(), {
                  type: 'spotify:track_change',
                  data: {
                    ...spotifyData,
                    message: `${user.username} is now listening to "${currentTrack.name}" by ${currentTrack.artist}`,
                    timestamp: new Date().toISOString()
                  }
                });
              }
            }
          }

          if (sentToUser) {
            log.debug(`🔔 Spotify track change notification sent to ${user.username}`);
          }
        }
      }

      this.stats.totalUpdates++;

    } catch (error) {
      // Handle token expiration gracefully - reduce log spam
      if (error.message?.includes('SPOTIFY_TOKEN_EXPIRED') || error.message?.includes('401')) {
        // Silently disconnect expired users instead of spamming logs
        if (user.musicProfile?.spotify?.connected) {
          user.musicProfile.spotify.connected = false;
          user.musicProfile.spotify.accessToken = null;
          user.musicProfile.spotify.refreshToken = null;
          await user.save();
          // Only log once when disconnecting, not every update cycle
          log.debug(`🔄 Disconnected expired Spotify account for ${user.username}`);
        }
      } else {
        // Only log unexpected errors, not token expiration
        log.warn(`Failed to update Spotify for user ${user.username}:`, error.message);
      }
      this.stats.totalErrors++;
    }
  }

  /**
   * Force update for a specific user
   */
  async forceUpdateUser(userId) {
    try {
      const user = await User.findById(userId).select('username musicProfile.spotify');
      
      if (!user || !user.musicProfile?.spotify?.connected) {
        return false;
      }

      await this.updateUserSpotifyStatus(user);
      return true;

    } catch (error) {
      log.error(`Force update failed for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      updateFrequency: this.updateFrequency,
      uptime: this.isRunning ? Date.now() - (this.stats.lastUpdateCycle?.getTime() || Date.now()) : 0
    };
  }

  /**
   * Update the refresh frequency
   */
  setUpdateFrequency(seconds) {
    const newFrequency = Math.max(10, seconds) * 1000; // Minimum 10 seconds
    
    if (newFrequency === this.updateFrequency) {
      return;
    }

    this.updateFrequency = newFrequency;

    // Restart with new frequency if currently running
    if (this.isRunning) {
      this.stop();
      this.start();
      log.info(`Spotify Live Service frequency updated to ${seconds} seconds`);
    }
  }

  /**
   * Get currently tracked users
   */
  async getTrackedUsers() {
    try {
      const users = await User.find({
        'musicProfile.spotify.connected': true
      }).select('username musicProfile.spotify.currentTrack');

      return users.map(user => ({
        username: user.username,
        hasCurrentTrack: !!(user.musicProfile?.spotify?.currentTrack?.name),
        currentTrack: user.musicProfile?.spotify?.currentTrack?.name || null,
        currentArtist: user.musicProfile?.spotify?.currentTrack?.artist || null
      }));

    } catch (error) {
      log.error('Failed to get tracked users:', error);
      return [];
    }
  }
}

export default new SpotifyLiveService();