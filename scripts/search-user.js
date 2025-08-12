/**
 * Script to search for users by email pattern
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const searchUser = async (searchTerm) => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    // Search for users with similar email
    const users = await User.find({
      $or: [
        { email: { $regex: searchTerm, $options: 'i' } },
        { username: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } }
      ]
    }, 'username email name tier createdAt').sort({ createdAt: -1 });

    console.log(`\n🔍 Search results for "${searchTerm}":\n`);
    
    if (users.length === 0) {
      console.log('No users found matching the search term');
      
      // Let's also show all users to help identify the correct one
      console.log('\n📋 All users in database:');
      const allUsers = await User.find({}, 'username email name tier createdAt').sort({ createdAt: -1 }).limit(20);
      
      console.log('Username'.padEnd(20) + 'Email'.padEnd(35) + 'Name'.padEnd(20) + 'Tier'.padEnd(10) + 'Created');
      console.log('-'.repeat(100));
      
      allUsers.forEach(user => {
        const username = (user.username || 'N/A').padEnd(20);
        const email = (user.email || 'N/A').padEnd(35);
        const name = (user.name || 'N/A').padEnd(20);
        const tier = (user.tier || 'Standard').padEnd(10);
        const created = user.createdAt ? user.createdAt.toLocaleDateString() : 'N/A';
        console.log(`${username}${email}${name}${tier}${created}`);
      });
    } else {
      console.log('Username'.padEnd(20) + 'Email'.padEnd(35) + 'Name'.padEnd(20) + 'Tier'.padEnd(10) + 'Created');
      console.log('-'.repeat(100));
      
      users.forEach(user => {
        const username = (user.username || 'N/A').padEnd(20);
        const email = (user.email || 'N/A').padEnd(35);
        const name = (user.name || 'N/A').padEnd(20);
        const tier = (user.tier || 'Standard').padEnd(10);
        const created = user.createdAt ? user.createdAt.toLocaleDateString() : 'N/A';
        console.log(`${username}${email}${name}${tier}${created}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

const searchTerm = process.argv[2] || 'isaiah';
searchUser(searchTerm);