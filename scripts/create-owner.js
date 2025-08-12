/**
 * Script to create the 'owner' user and promote to VIP
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../src/models/User.js';
import TierService from '../src/services/tierService.js';

const createOwnerUser = async () => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    // Check if owner already exists
    const existingOwner = await User.findOne({ username: 'owner' });
    
    if (existingOwner) {
      console.log('👤 User "owner" already exists');
      console.log(`📊 Current tier: ${existingOwner.tier || 'Standard'}`);
      
      // Just promote to VIP if not already
      if (existingOwner.tier !== 'VIP') {
        const result = await TierService.upgradeTier(existingOwner._id, 'VIP');
        if (result.success) {
          console.log(`✅ ${result.message}`);
          console.log(`🎉 User 'owner' is now VIP tier!`);
        }
      } else {
        console.log('👤 User "owner" is already VIP tier!');
      }
      return;
    }

    // Create new owner user
    const hashedPassword = await bcrypt.hash('owner123', 10);
    
    const ownerUser = new User({
      username: 'owner',
      email: 'owner@aether.dev',
      password: hashedPassword,
      name: 'Owner',
      displayName: 'Owner',
      tier: 'VIP',
      gpt5Usage: {
        monthlyCount: 0,
        totalUsage: 0,
        currentMonth: new Date().toISOString().slice(0, 7),
        lastReset: new Date()
      }
    });

    await ownerUser.save();
    console.log('✅ Created user "owner" with VIP tier');
    console.log('👤 Username: owner');
    console.log('📧 Email: owner@aether.dev');
    console.log('🔑 Password: [REDACTED]');
    console.log('🎉 Tier: VIP (Unlimited GPT-5)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  }
};

createOwnerUser();