/**
 * Real Data Population Script
 * Fetches real artist data and news from Spotify and reputable news sources
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import realDataIngestionService from '../src/services/realDataIngestionService.js';
import User from '../src/models/User.js';
import Artist from '../src/models/Artist.js';
import ArtistUpdate from '../src/models/ArtistUpdate.js';

dotenv.config();

async function populateRealData() {
  try {
    console.log('🎵 AETHER: Populating database with REAL artist data and news...');
    console.log('================================================================');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Optional: Clear existing data (comment out to preserve)
    console.log('\n🗑️ Clearing existing test data...');
    await Artist.deleteMany({});
    await ArtistUpdate.deleteMany({});
    console.log('✅ Cleared existing data');

    // Ingest popular rap/hip-hop artists with real data
    console.log('\n🎤 Ingesting popular rap/hip-hop artists...');
    console.log('This will fetch real data from Spotify and news sources...');
    
    const results = await realDataIngestionService.ingestPopularRapArtists();
    
    console.log('\n📊 INGESTION RESULTS:');
    console.log('===================');
    
    let successCount = 0;
    let failureCount = 0;
    
    results.forEach(result => {
      if (result.success) {
        successCount++;
        console.log(`✅ ${result.artist}: ${result.releases} releases, ${result.news} news articles`);
      } else {
        failureCount++;
        console.log(`❌ ${result.artist}: ${result.error || 'Failed'}`);
      }
    });

    // Update existing users to follow some of these real artists
    console.log('\n👥 Setting up user follows for real artists...');
    const existingUsers = await User.find({});
    const artists = await Artist.find({}).limit(10); // Get first 10 artists
    
    if (existingUsers.length > 0 && artists.length > 0) {
      for (const user of existingUsers) {
        // Make users follow 3-5 random artists
        const randomArtists = artists
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.floor(Math.random() * 3) + 3);

        user.artistPreferences = user.artistPreferences || {};
        user.artistPreferences.followedArtists = randomArtists.map(artist => ({
          artistId: artist._id,
          followedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          notificationSettings: {
            releases: true,
            news: true,
            tours: true,
            social: false
          }
        }));

        await user.save();
      }
      console.log(`✅ Updated ${existingUsers.length} users with real artist follows`);
    }

    // Final statistics
    const finalStats = {
      artists: await Artist.countDocuments(),
      updates: await ArtistUpdate.countDocuments(),
      users: await User.countDocuments(),
      releaseUpdates: await ArtistUpdate.countDocuments({ updateType: 'release' }),
      newsUpdates: await ArtistUpdate.countDocuments({ updateType: 'news' })
    };

    console.log('\n🎉 REAL DATA POPULATION COMPLETE!');
    console.log('=================================');
    console.log(`✅ Successfully processed: ${successCount} artists`);
    console.log(`❌ Failed: ${failureCount} artists`);
    console.log(`📈 Total artists in DB: ${finalStats.artists}`);
    console.log(`📰 Total updates in DB: ${finalStats.updates}`);
    console.log(`🎵 Release updates: ${finalStats.releaseUpdates}`);
    console.log(`📰 News updates: ${finalStats.newsUpdates}`);
    console.log(`👥 Users with follows: ${finalStats.users}`);
    
    console.log('\n🔥 Your news/buzz screen should now show REAL artist data!');
    console.log('🎯 Focused on rap/hip-hop with real Spotify releases and news articles');

  } catch (error) {
    console.error('❌ Failed to populate real data:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Test a single artist first (optional)
async function testSingleArtist(artistName = 'Drake') {
  try {
    console.log(`🧪 Testing data ingestion for: ${artistName}`);
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const result = await realDataIngestionService.ingestArtistData(artistName);
    console.log('Test result:', result);

    const artist = await Artist.findOne({ name: artistName });
    const updates = await ArtistUpdate.find({ artistName }).limit(5);
    
    console.log(`\n📊 Results for ${artistName}:`);
    console.log(`Artist found: ${artist ? 'YES' : 'NO'}`);
    console.log(`Updates created: ${updates.length}`);
    
    if (updates.length > 0) {
      console.log('\nSample updates:');
      updates.forEach(update => {
        console.log(`- ${update.updateType}: ${update.title}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Check command line arguments
const command = process.argv[2];

if (command === 'test') {
  const artistName = process.argv[3] || 'Drake';
  testSingleArtist(artistName);
} else {
  populateRealData();
}

export { populateRealData, testSingleArtist };