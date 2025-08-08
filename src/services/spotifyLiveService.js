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
      // Find users with Spotify connected
      const spotifyUsers = await User.find({
        'socialProxy.spotify.connected': true,
        'socialProxy.spotify.accessToken': { $exists: true, $ne: null }
      }).select('_id username socialProxy.spotify');

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
      // Store previous track for comparison
      const previousTrack = user.socialProxy.spotify.currentTrack;
      const previousTrackId = previousTrack ? 
        `${previousTrack.name}-${previousTrack.artist}` : null;

      // Update Spotify data
      const success = await spotifyService.updateUserSpotifyData(user);
      
      if (!success) {
        return;
      }

      // Check if current track changed
      const currentTrack = user.socialProxy.spotify.currentTrack;
      const currentTrackId = currentTrack && currentTrack.name ? 
        `${currentTrack.name}-${currentTrack.artist}` : null;

      // Send notification if track changed and user is actively listening
      if (currentTrackId && currentTrackId !== previousTrackId) {
        // Only notify if the track is actually playing (not paused)
        if (currentTrack.isPlaying) {
          const sent = notificationService.notifySpotifyUpdate(user._id.toString(), {
            type: 'track_change',
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
          });

          if (sent) {
            log.debug(`🔔 Spotify track change notification sent to ${user.username}`);
          }
        }
      }

      this.stats.totalUpdates++;

    } catch (error) {
      // Handle token expiration gracefully - reduce log spam
      if (error.message?.includes('SPOTIFY_TOKEN_EXPIRED') || error.message?.includes('401')) {
        // Silently disconnect expired users instead of spamming logs
        if (user.socialProxy?.spotify?.connected) {
          user.socialProxy.spotify.connected = false;
          user.socialProxy.spotify.accessToken = null;
          user.socialProxy.spotify.refreshToken = null;
          await user.save();
          log.info(`🔄 Disconnected expired Spotify account for ${user.username}`);
        }
      } else {
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
      const user = await User.findById(userId).select('username socialProxy.spotify');
      
      if (!user || !user.socialProxy?.spotify?.connected) {
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
        'socialProxy.spotify.connected': true
      }).select('username socialProxy.spotify.currentTrack');

      return users.map(user => ({
        username: user.username,
        hasCurrentTrack: !!(user.socialProxy?.spotify?.currentTrack?.name),
        currentTrack: user.socialProxy?.spotify?.currentTrack?.name || null,
        currentArtist: user.socialProxy?.spotify?.currentTrack?.artist || null
      }));

    } catch (error) {
      log.error('Failed to get tracked users:', error);
      return [];
    }
  }
}

export default new SpotifyLiveService();