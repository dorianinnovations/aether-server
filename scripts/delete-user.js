/**
 * Script to delete a user account from the database
 * Usage: node scripts/delete-user.js <email_or_username>
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const deleteUser = async (identifier) => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    });
    
    if (!user) {
      console.log(`❌ User with identifier '${identifier}' not found`);
      return;
    }

    console.log(`👤 Found user: ${user.username} (${user.email})`);
    console.log(`🆔 User ID: ${user._id}`);
    console.log(`📊 Tier: ${user.tier || 'Standard'}`);

    // Delete the user
    const result = await User.deleteOne({ _id: user._id });

    if (result.deletedCount > 0) {
      console.log(`✅ Successfully deleted user '${user.username}' (${user.email})`);
      
      // Also check and delete from related collections
      const db = mongoose.connection.db;
      
      // Delete user badges
      const badgesResult = await db.collection('userbadges').deleteMany({ user: user._id });
      if (badgesResult.deletedCount > 0) {
        console.log(`🏆 Deleted ${badgesResult.deletedCount} badges`);
      }
      
      // Delete conversations
      const conversationsResult = await db.collection('conversations').deleteMany({ user: user._id });
      if (conversationsResult.deletedCount > 0) {
        console.log(`💬 Deleted ${conversationsResult.deletedCount} conversations`);
      }
      
      // Delete user analytics
      const analyticsResult = await db.collection('useranalytics').deleteMany({ user: user._id });
      if (analyticsResult.deletedCount > 0) {
        console.log(`📊 Deleted ${analyticsResult.deletedCount} analytics records`);
      }
      
      // Delete user memory
      const memoryResult = await db.collection('usermemories').deleteMany({ user: user._id });
      if (memoryResult.deletedCount > 0) {
        console.log(`🧠 Deleted ${memoryResult.deletedCount} memory records`);
      }
      
      console.log(`🗑️ User '${user.username}' and all associated data deleted successfully`);
    } else {
      console.log('❌ Failed to delete user');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📊 Disconnected from MongoDB');
  }
};

// Get command line arguments
const identifier = process.argv[2];

if (!identifier) {
  console.log('Usage: node scripts/delete-user.js <email_or_username>');
  console.log('Example: node scripts/delete-user.js user@example.com');
  console.log('Example: node scripts/delete-user.js username');
  process.exit(1);
}

deleteUser(identifier);