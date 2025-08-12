/**
 * Script to promote a user to VIP tier by email address
 * Usage: node scripts/promote-by-email.js <email> <tier>
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import TierService from '../src/services/tierService.js';

const promoteUserByEmail = async (email, newTier) => {
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

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      throw new Error(`User with email '${email}' not found`);
    }

    console.log(`👤 Found user: ${user.username || 'N/A'} (${user.email})`);
    console.log(`📊 Current tier: ${user.tier || 'Standard'}`);

    // Use TierService to upgrade
    const result = await TierService.upgradeTier(user._id, newTier);

    if (result.success) {
      console.log(`✅ ${result.message}`);
      console.log(`🎉 User '${user.username || user.email}' is now ${newTier} tier!`);
      
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
const email = args[0];
const tier = args[1] || 'VIP';

if (!email) {
  console.log('Usage: node scripts/promote-by-email.js <email> [tier]');
  console.log('Example: node scripts/promote-by-email.js isaiah.vq@gmail.com VIP');
  console.log('Valid tiers: Standard, Legend, VIP (default: VIP)');
  process.exit(1);
}

promoteUserByEmail(email, tier);