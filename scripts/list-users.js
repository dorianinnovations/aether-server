/**
 * Script to list all users in the database
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';

const listUsers = async () => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');

    // Find all users from numina collection
    const users = await User.find({}, 'username email tier createdAt').sort({ createdAt: -1 });
    
    // Also check the direct numina collection if User model doesn't work
    const db = mongoose.connection.db;
    const numinaUsers = await db.collection('numina').find({}, { 
      projection: { username: 1, email: 1, tier: 1, createdAt: 1 } 
    }).toArray();
    
    // Display results from both sources
    console.log(`\n📊 User model results: ${users.length} users`);
    console.log(`📊 Numina collection results: ${numinaUsers.length} users`);
    
    const allUsers = [...users, ...numinaUsers];
    if (allUsers.length === 0) {
      console.log('No users found in either collection');
    } else {
      console.log(`\n👥 All users found:\n`);
      console.log('Username'.padEnd(20) + 'Email'.padEnd(30) + 'Tier'.padEnd(10) + 'Created');
      console.log('-'.repeat(80));
      
      allUsers.forEach(user => {
        const username = (user.username || 'N/A').padEnd(20);
        const email = (user.email || 'N/A').padEnd(30);
        const tier = (user.tier || 'Standard').padEnd(10);
        const created = user.createdAt ? user.createdAt.toLocaleDateString() : 'N/A';
        console.log(`${username}${email}${tier}${created}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

listUsers();