import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Check artistupdates collection
    const count = await db.collection('artistupdates').countDocuments();
    console.log('ArtistUpdates count:', count);
    
    if (count > 0) {
      const sample = await db.collection('artistupdates').findOne();
      console.log('Sample document keys:', Object.keys(sample));
      console.log('Sample updateType:', sample.updateType);
      console.log('Sample artistName:', sample.artistName);
    } else {
      console.log('❌ NO ARTIST UPDATES FOUND IN DATABASE');
    }
    
    // Check artists collection
    const artistCount = await db.collection('artists').countDocuments();
    console.log('Artists count:', artistCount);
    
    // Check if any users are following artists
    const userSample = await db.collection('users').findOne({'artistPreferences.followedArtists': {$exists: true, $ne: []}});
    console.log('Users with followed artists:', userSample ? 'YES' : 'NONE');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkDatabase();