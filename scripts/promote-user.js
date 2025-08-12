/**
 * Script to promote a user to a specific tier
 * Usage: node scripts/promote-user.js <username> <tier>
 * Example: node scripts/promote-user.js owner VIP
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import TierService from '../src/services/tierService.js';

const promoteUser = async (username, newTier) => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    // Validate tier
    const validTiers = ['Standard', 'Legend', 'VIP'];
    if (!validTiers.includes(newTier)) {
      throw new Error(`Invalid tier: ${newTier}. Valid tiers: ${validTiers.join(', ')}`);
    }

    // Find user by username - try both User model and direct collection access
    let user = await User.findOne({ username: username.toLowerCase() });
    
    if (!user) {
      // Try direct collection access for numina collection
      const db = mongoose.connection.db;
      const numinaUser = await db.collection('users').findOne({ username: username.toLowerCase() });
      
      if (numinaUser) {
        user = numinaUser;
        console.log('👤 Found user in users collection');
      } else {
        throw new Error(`User '${username}' not found in users collection`);
      }
    }

    console.log(`👤 Found user: ${user.username} (${user.email})`);
    console.log(`📊 Current tier: ${user.tier || 'Standard'}`);

    // Use TierService to upgrade
    const result = await TierService.upgradeTier(user._id, newTier);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`🎉 User '${username}' is now ${newTier} tier!`);
      
      // Show new tier info
      const tierInfo = await TierService.getUserTierInfo(user._id);
      console.log(`📈 New GPT-5 limit: ${tierInfo.isUnlimited ? 'Unlimited' : tierInfo.limit} calls/month`);
    } else {
      console.error(`❌ Failed to promote user: ${result.message}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  }
};

// Get command line arguments
const args = process.argv.slice(2);
const username = args[0];
const tier = args[1];

if (!username || !tier) {
  console.log('Usage: node scripts/promote-user.js <username> <tier>');
  console.log('Example: node scripts/promote-user.js owner VIP');
  console.log('Valid tiers: Standard, Legend, VIP');
  process.exit(1);
}

promoteUser(username, tier);