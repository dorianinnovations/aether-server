/**
 * Script to do a broader search across databases
 */

import 'dotenv/config';
import mongoose from 'mongoose';

const broadSearch = async () => {
  try {
    // Connect to the MongoDB cluster
    const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/aether';
    console.log('🔗 Connecting to:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    
    await mongoose.connect(MONGODB_URI);
    console.log('📊 Connected to MongoDB');
    
    const client = mongoose.connection.getClient();
    
    // List all databases
    const adminDb = client.db().admin();
    const databases = await adminDb.listDatabases();
    
    console.log('\n📋 All databases:');
    databases.databases.forEach(db => console.log(`- ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`));
    
    // Search in each database
    const email = 'isaiah.vq@gmail.com';
    console.log(`\n🔍 Searching for "${email}" across all databases...\n`);
    
    for (const database of databases.databases) {
      if (database.name === 'admin' || database.name === 'local' || database.name === 'config') continue;
      
      try {
        console.log(`\n📂 Checking database: ${database.name}`);
        const db = client.db(database.name);
        const collections = await db.listCollections().toArray();
        
        for (const col of collections) {
          try {
            const collection = db.collection(col.name);
            const docs = await collection.find({ 
              $or: [
                { email: { $regex: email, $options: 'i' } },
                { email: { $regex: 'isaiah', $options: 'i' } }
              ]
            }).limit(5).toArray();
            
            if (docs.length > 0) {
              console.log(`✅ Found ${docs.length} documents in ${database.name}.${col.name}:`);
              docs.forEach(doc => {
                console.log(`  - Email: ${doc.email}`);
                console.log(`    Username: ${doc.username || 'N/A'}`);
                console.log(`    Tier: ${doc.tier || 'N/A'}`);
                console.log(`    ID: ${doc._id}`);
                console.log('    ---');
              });
            }
          } catch (err) {
            // Skip collections that can't be searched
          }
        }
      } catch (err) {
        console.log(`❌ Error accessing database ${database.name}: ${err.message}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n📊 Disconnected from MongoDB');
  }
};

broadSearch();