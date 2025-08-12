/**
 * Script to check current badges for a user
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const checkUserBadges = async (email) => {
  try {
    // Connect to the numina database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    const numinaURI = MONGODB_URI.replace('/aether?', '/numina?');
    
    await mongoose.connect(numinaURI);
    console.log('📊 Connected to MongoDB (numina database)');
    
    const db = mongoose.connection.db;
    
    // Find the user
    const user = await db.collection('users').findOne({ email: email });
    if (!user) {
      throw new Error(`User with email "${email}" not found`);
    }
    
    console.log(`👤 User: ${user.username} (${user.email})`);
    console.log(`📊 Tier: ${user.tier || 'Standard'}`);
    console.log(`🆔 User ID: ${user._id}`);
    
    // Check badges in different possible collections
    const collections = ['userbadges', 'badges', 'user_badges'];
    
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const badges = await collection.find({ user: user._id }).toArray();
        
        if (badges.length > 0) {
          console.log(`\n🏆 Found ${badges.length} badges in ${collectionName}:`);
          badges.forEach(badge => {
            console.log(`  - ${badge.badgeType} (awarded: ${badge.createdAt || 'unknown'})`);
            if (badge.metadata) console.log(`    Metadata: ${JSON.stringify(badge.metadata)}`);
          });
        } else {
          console.log(`\n📝 No badges found in ${collectionName}`);
        }
      } catch (err) {
        console.log(`❌ Could not check collection ${collectionName}: ${err.message}`);
      }
    }
    
    // Also check if there are badge-related fields in the user document itself
    if (user.badges) {
      console.log(`\n🏆 Badges in user document: ${JSON.stringify(user.badges)}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/check-user-badges.js <email>');
  console.log('Example: node scripts/check-user-badges.js user@example.com');
  process.exit(1);
}
checkUserBadges(email);