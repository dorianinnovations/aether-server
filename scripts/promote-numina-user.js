/**
 * Script to promote user in the numina database
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const promoteUser = async (email, newTier) => {
  try {
    // Connect to the numina database specifically
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    const numinaURI = MONGODB_URI.replace('/aether?', '/numina?');
    
    console.log('🔗 Connecting to numina database...');
    await mongoose.connect(numinaURI);
    console.log('📊 Connected to MongoDB (numina database)');
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Find the user
    const user = await usersCollection.findOne({ email: email });
    
    if (!user) {
      throw new Error(`User with email "${email}" not found in numina database`);
    }
    
    console.log(`👤 Found user: ${user.username} (${user.email})`);
    console.log(`📊 Current tier: ${user.tier || 'Standard'}`);
    
    // Update the tier
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          tier: newTier,
          updatedAt: new Date()
        } 
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Successfully updated user tier from ${user.tier || 'Standard'} to ${newTier}`);
      console.log(`🎉 User "${user.username}" is now ${newTier} tier!`);
      
      // Show tier benefits
      if (newTier === 'VIP') {
        console.log('📈 VIP Benefits:');
        console.log('  - Unlimited GPT-5 calls');
        console.log('  - Unlimited GPT-4o access');
        console.log('  - Priority processing');
        console.log('  - Early access to new features');
      }
      
      // Verify the update
      const updatedUser = await usersCollection.findOne({ _id: user._id });
      console.log(`🔍 Verification: User tier is now "${updatedUser.tier}"`);
      
    } else {
      console.log('❌ No changes made to user tier');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  }
};

const email = process.argv[2];
if (!email) {
  console.log('Usage: node scripts/promote-numina-user.js <email> [tier]');
  console.log('Example: node scripts/promote-numina-user.js user@example.com VIP');
  process.exit(1);
}
const tier = process.argv[3] || 'VIP';

promoteUser(email, tier);