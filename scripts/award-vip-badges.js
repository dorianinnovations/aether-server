/**
 * Script to award VIP tier badges to a user
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const awardVIPBadges = async (email) => {
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
    
    // VIP Tier Badge List - Your proprietary badges
    const vipBadges = [
      {
        badgeType: 'founder',
        name: 'Founder',
        description: 'Original founder of the platform',
        rarity: 'legendary',
        color: '#FFD700'
      },
      {
        badgeType: 'og',
        name: 'OG Member',
        description: 'One of the original members',
        rarity: 'rare',
        color: '#FF6B6B'
      },
      {
        badgeType: 'vip',
        name: 'VIP Member',
        description: 'Premium VIP tier member with unlimited access',
        rarity: 'epic',
        color: '#9D4EDD'
      },
      {
        badgeType: 'legendary',
        name: 'Legendary Status',
        description: 'Achieved legendary status in the community',
        rarity: 'legendary',
        color: '#F72585'
      },
      {
        badgeType: 'elite',
        name: 'Elite User',
        description: 'Elite tier access with premium features',
        rarity: 'epic',
        color: '#4361EE'
      }
    ];
    
    // Create badges collection if it doesn't exist
    const badgesCollection = db.collection('userbadges');
    
    // Award each badge
    const awardedBadges = [];
    for (const badge of vipBadges) {
      try {
        // Check if badge already exists
        const existingBadge = await badgesCollection.findOne({
          user: user._id,
          badgeType: badge.badgeType
        });
        
        if (existingBadge) {
          console.log(`✅ Badge ${badge.badgeType} already exists`);
          continue;
        }
        
        // Create new badge
        const newBadge = {
          user: user._id,
          badgeType: badge.badgeType,
          name: badge.name,
          description: badge.description,
          rarity: badge.rarity,
          color: badge.color,
          isVisible: true,
          awardedBy: user._id, // Self-awarded as the owner
          metadata: {
            awardedReason: 'VIP tier promotion',
            tierLevel: user.tier
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await badgesCollection.insertOne(newBadge);
        awardedBadges.push(badge.badgeType);
        console.log(`🏆 Awarded ${badge.name} badge`);
        
      } catch (error) {
        console.error(`❌ Failed to award ${badge.badgeType}: ${error.message}`);
      }
    }
    
    // Also update user document with badge references
    const userUpdate = {
      $set: {
        badges: vipBadges.map(b => b.badgeType),
        badgeCount: vipBadges.length,
        lastBadgeUpdate: new Date()
      }
    };
    
    await db.collection('users').updateOne({ _id: user._id }, userUpdate);
    
    console.log(`\n✅ Successfully awarded ${awardedBadges.length} VIP badges!`);
    console.log(`🎉 VIP Badge Portfolio Complete:`);
    vipBadges.forEach(badge => {
      console.log(`  🏆 ${badge.name} - ${badge.description}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/award-vip-badges.js <email>');
  console.log('Example: node scripts/award-vip-badges.js user@example.com');
  process.exit(1);
}
awardVIPBadges(email);