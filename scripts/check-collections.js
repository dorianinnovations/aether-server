/**
 * Script to check all collections and find the user
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const checkCollections = async () => {
  try {
    // Connect to database
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 All collections in database:');
    collections.forEach(col => console.log(`- ${col.name}`));
    
    // Search in each collection for the email
    const email = 'isaiah.vq@gmail.com';
    console.log(`\n🔍 Searching for "${email}" in all collections...\n`);
    
    for (const col of collections) {
      try {
        const collection = db.collection(col.name);
        const docs = await collection.find({ 
          $or: [
            { email: { $regex: email, $options: 'i' } },
            { email: { $regex: 'isaiah', $options: 'i' } }
          ]
        }).toArray();
        
        if (docs.length > 0) {
          console.log(`✅ Found ${docs.length} documents in collection "${col.name}":`);
          docs.forEach(doc => {
            console.log(`  - Email: ${doc.email}, Username: ${doc.username || 'N/A'}, ID: ${doc._id}`);
            if (doc.tier) console.log(`    Tier: ${doc.tier}`);
          });
        }
      } catch (err) {
        // Skip collections that can't be searched
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

checkCollections();