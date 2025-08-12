#!/usr/bin/env node

/**
 * Remove Mock Data Script
 * Removes hardcoded mock artist follows and other mock data from user accounts
 */

import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { log } from '../src/utils/logger.js';

async function removeMockArtists() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/aether-ai');
    log.info('Connected to MongoDB');

    // Find users with mock quick_ artists
    const usersWithMockArtists = await User.find({
      'artistPreferences.followedArtists.artistId': { $regex: /^quick_/ }
    });

    log.info(`Found ${usersWithMockArtists.length} users with mock artists`);

    let totalRemoved = 0;

    for (const user of usersWithMockArtists) {
      const originalCount = user.artistPreferences.followedArtists.length;
      
      // Remove all quick_ prefixed artists
      user.artistPreferences.followedArtists = user.artistPreferences.followedArtists.filter(
        artist => !artist.artistId.startsWith('quick_')
      );

      const removedCount = originalCount - user.artistPreferences.followedArtists.length;
      totalRemoved += removedCount;

      // Reset analytics counts
      if (user.analytics?.listeningStats) {
        user.analytics.listeningStats.totalArtistsFollowed = user.artistPreferences.followedArtists.length;
        user.analytics.listeningStats.totalUpdatesReceived = 0;
        user.analytics.listeningStats.totalReleasesDiscovered = 0;
        user.analytics.listeningStats.averageUpdatesPerDay = 0;
      }

      // Clear engagement data related to mock artists
      if (user.analytics?.engagement) {
        user.analytics.engagement.feedInteractions = [];
        user.analytics.engagement.mostEngagedArtists = [];
        user.analytics.engagement.discoveryPatterns = {
          discoveriesThisMonth: 0,
          discoveryStreak: 0
        };
      }

      await user.save();
      log.info(`Removed ${removedCount} mock artists from user ${user.username || user.email}`);
    }

    log.info(`✅ Successfully removed ${totalRemoved} mock artist follows`);

    // Also remove any mock artists from the Artist collection
    const Artist = mongoose.model('Artist');
    const mockArtists = await Artist.deleteMany({
      artistId: { $regex: /^quick_/ }
    });

    log.info(`✅ Removed ${mockArtists.deletedCount} mock artist documents`);

    await mongoose.disconnect();
    log.info('Disconnected from MongoDB');

  } catch (error) {
    log.error('Error removing mock data:', error);
    process.exit(1);
  }
}

// Run the script
removeMockArtists();