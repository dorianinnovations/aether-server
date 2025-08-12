/**
 * Database Seeding Script for Aether Artist Tracking
 * Populates database with sample artists, updates, and user data for testing
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import models
import Artist from '../src/models/Artist.js';
import ArtistUpdate from '../src/models/ArtistUpdate.js';
import User from '../src/models/User.js';

async function seedDatabase() {
  try {
    console.log('🎵 Seeding Aether database with sample data...');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing data (optional - comment out to preserve existing data)
    console.log('🗑️ Clearing existing data...');
    await Artist.deleteMany({});
    await ArtistUpdate.deleteMany({});
    
    // Create sample artists
    console.log('👨‍🎤 Creating sample artists...');
    const artists = await Artist.insertMany([
      {
        name: 'The Midnight',
        spotifyId: 'spotify:artist:2NFrAuh8RQdQoS7iYFbckw',
        genres: ['synthwave', 'electronic', 'indie'],
        image: 'https://i.scdn.co/image/ab67616d0000b2733f2cce0aee42ede78a45b3a1',
        followers: 150000,
        popularity: 72,
        bio: 'Synthwave duo creating nostalgic electronic music with a modern twist.',
        socialLinks: {
          spotify: 'https://open.spotify.com/artist/2NFrAuh8RQdQoS7iYFbckw',
          twitter: 'https://twitter.com/themidnight',
          instagram: 'https://instagram.com/themidnight'
        },
        isVerified: true,
        trackingEnabled: true
      },
      {
        name: 'Carpenter Brut',
        spotifyId: 'spotify:artist:1l2oLiukA9i5jEtIyNSUVS',
        genres: ['darksynth', 'synthwave', 'electronic'],
        image: 'https://i.scdn.co/image/ab67616d0000b273d7fb209c8c4c694d1ec3996a',
        followers: 95000,
        popularity: 68,
        bio: 'French darksynth artist known for horror-inspired electronic music.',
        socialLinks: {
          spotify: 'https://open.spotify.com/artist/1l2oLiukA9i5jEtIyNSUVS',
          bandcamp: 'https://carpenterbrut.bandcamp.com'
        },
        isVerified: true,
        trackingEnabled: true
      },
      {
        name: 'Perturbator',
        spotifyId: 'spotify:artist:244uLu4LNKqdjqFAVoaF0D',
        genres: ['darksynth', 'cyberpunk', 'electronic'],
        image: 'https://i.scdn.co/image/ab67616d0000b273b8be85b6c9c6e663c1f26145',
        followers: 120000,
        popularity: 70,
        bio: 'Pioneer of the darksynth genre, creating cyberpunk-inspired electronic music.',
        socialLinks: {
          spotify: 'https://open.spotify.com/artist/244uLu4LNKqdjqFAVoaF0D',
          twitter: 'https://twitter.com/perturbator'
        },
        isVerified: true,
        trackingEnabled: true
      },
      {
        name: 'Daniel Deluxe',
        spotifyId: 'spotify:artist:3o2dn2O0fcVsEGyGu3I8JF',
        genres: ['synthwave', 'outrun', 'electronic'],
        image: 'https://i.scdn.co/image/ab67616d0000b273f7b7c157f2cd2b5b2e5a2c3d',
        followers: 75000,
        popularity: 65,
        bio: 'High-energy synthwave producer bringing retro sounds to modern dancefloors.',
        socialLinks: {
          spotify: 'https://open.spotify.com/artist/3o2dn2O0fcVsEGy3I8JF',
          soundcloud: 'https://soundcloud.com/danieldeluxe'
        },
        isVerified: true,
        trackingEnabled: true
      },
      {
        name: 'NINA',
        spotifyId: 'spotify:artist:5ZKMPRDHc7AOJAl2MFHPDY',
        genres: ['synthpop', 'electronic', 'indie'],
        image: 'https://i.scdn.co/image/ab67616d0000b273e8b066f70c206551210d902c',
        followers: 45000,
        popularity: 62,
        bio: 'Synthpop artist combining vintage electronics with modern production.',
        socialLinks: {
          spotify: 'https://open.spotify.com/artist/5ZKMPRDHc7AOJAl2MFHPDY',
          instagram: 'https://instagram.com/ninasynth'
        },
        isVerified: true,
        trackingEnabled: true
      }
    ]);

    console.log(`✅ Created ${artists.length} sample artists`);

    // Create sample artist updates (news, releases, tours)
    console.log('📰 Creating sample artist updates...');
    
    const now = new Date();
    const updates = [];

    // Helper function to create updates for an artist
    const createUpdatesForArtist = (artist) => {
      const artistUpdates = [];

      // Recent release
      artistUpdates.push({
        artistId: artist._id,
        artistName: artist.name,
        updateType: 'release',
        title: `New Single: "${artist.name === 'The Midnight' ? 'Neon Nights' : 'Digital Dreams'}"`,
        description: `${artist.name} drops their latest single, featuring their signature sound with a fresh twist.`,
        content: {
          releaseInfo: {
            type: 'single',
            releaseDate: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Last 7 days
            trackCount: 1,
            duration: 240,
            label: 'Independent',
            genres: artist.genres,
            collaborators: []
          }
        },
        media: {
          images: [{
            url: artist.image,
            type: 'cover_art',
            width: 640,
            height: 640
          }]
        },
        targeting: {
          relevanceScore: 0.9,
          priority: 'high'
        },
        distribution: {
          originalPublishDate: new Date(now.getTime() - Math.random() * 5 * 24 * 60 * 60 * 1000),
          distributionStarted: new Date(),
          stats: {
            usersNotified: Math.floor(Math.random() * 1000),
            usersEngaged: Math.floor(Math.random() * 200),
            totalViews: Math.floor(Math.random() * 500)
          }
        },
        processing: {
          status: 'distributed',
          aiAnalysis: {
            summary: `New single release from ${artist.name}`,
            sentiment: 'positive',
            topics: ['music', 'release', artist.genres[0]],
            keywords: ['single', 'new', 'music', artist.name],
            importance: 0.8
          },
          quality: {
            hasValidMedia: true,
            hasValidLinks: true,
            contentLength: 120,
            qualityScore: 0.9
          }
        },
        engagement: {
          totalEngagements: Math.floor(Math.random() * 50),
          engagementRate: Math.random() * 0.3
        },
        lifecycle: {
          isActive: true,
          isArchived: false,
          isDeleted: false
        }
      });

      // News update
      artistUpdates.push({
        artistId: artist._id,
        artistName: artist.name,
        updateType: 'news',
        title: `${artist.name} Featured in Electronic Music Magazine`,
        description: `Read about ${artist.name}'s creative process and upcoming projects in this exclusive interview.`,
        content: {
          articleInfo: {
            source: 'Electronic Music Weekly',
            author: 'Music Journalist',
            publishedAt: new Date(now.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000),
            url: `https://electronicmusic.com/interviews/${artist.name.toLowerCase().replace(/\s+/g, '-')}`,
            category: 'interview',
            sentiment: 'positive'
          }
        },
        media: {
          images: [{
            url: artist.image,
            type: 'photo',
            width: 800,
            height: 600
          }]
        },
        targeting: {
          relevanceScore: 0.7,
          priority: 'medium'
        },
        distribution: {
          originalPublishDate: new Date(now.getTime() - Math.random() * 4 * 24 * 60 * 60 * 1000),
          distributionStarted: new Date(),
          stats: {
            usersNotified: Math.floor(Math.random() * 800),
            usersEngaged: Math.floor(Math.random() * 150),
            totalViews: Math.floor(Math.random() * 300)
          }
        },
        processing: {
          status: 'distributed',
          aiAnalysis: {
            summary: `Interview feature about ${artist.name}`,
            sentiment: 'positive',
            topics: ['interview', 'music', 'artist'],
            keywords: ['interview', 'featured', artist.name],
            importance: 0.6
          },
          quality: {
            hasValidMedia: true,
            hasValidLinks: true,
            contentLength: 200,
            qualityScore: 0.8
          }
        },
        engagement: {
          totalEngagements: Math.floor(Math.random() * 30),
          engagementRate: Math.random() * 0.2
        },
        lifecycle: {
          isActive: true,
          isArchived: false,
          isDeleted: false
        }
      });

      // Tour announcement (for some artists)
      if (Math.random() > 0.5) {
        artistUpdates.push({
          artistId: artist._id,
          artistName: artist.name,
          updateType: 'tour',
          title: `${artist.name} Announces North American Tour`,
          description: `${artist.name} is hitting the road with an exciting tour across major cities.`,
          content: {
            eventInfo: {
              venue: 'Various Venues',
              city: 'Multiple Cities',
              country: 'USA',
              date: new Date(now.getTime() + Math.random() * 90 * 24 * 60 * 60 * 1000), // Next 90 days
              ticketUrl: `https://tickets.com/${artist.name.toLowerCase().replace(/\s+/g, '-')}-tour`,
              price: {
                min: 25,
                max: 85,
                currency: 'USD'
              },
              eventType: 'tour_announcement'
            }
          },
          media: {
            images: [{
              url: artist.image,
              type: 'poster',
              width: 600,
              height: 800
            }]
          },
          targeting: {
            relevanceScore: 0.95,
            priority: 'urgent'
          },
          distribution: {
            originalPublishDate: new Date(now.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000),
            distributionStarted: new Date(),
            stats: {
              usersNotified: Math.floor(Math.random() * 1200),
              usersEngaged: Math.floor(Math.random() * 300),
              totalViews: Math.floor(Math.random() * 600)
            }
          },
          processing: {
            status: 'distributed',
            aiAnalysis: {
              summary: `Tour announcement from ${artist.name}`,
              sentiment: 'positive',
              topics: ['tour', 'live music', 'concert'],
              keywords: ['tour', 'concert', 'live', artist.name],
              importance: 0.95
            },
            quality: {
              hasValidMedia: true,
              hasValidLinks: true,
              contentLength: 150,
              qualityScore: 0.9
            }
          },
          engagement: {
            totalEngagements: Math.floor(Math.random() * 80),
            engagementRate: Math.random() * 0.4
          },
          lifecycle: {
            isActive: true,
            isArchived: false,
            isDeleted: false
          }
        });
      }

      return artistUpdates;
    };

    // Generate updates for each artist
    artists.forEach(artist => {
      updates.push(...createUpdatesForArtist(artist));
    });

    const insertedUpdates = await ArtistUpdate.insertMany(updates);
    console.log(`✅ Created ${insertedUpdates.length} sample artist updates`);

    // Update existing users to follow some artists (if any exist)
    console.log('👥 Setting up user artist follows...');
    const existingUsers = await User.find({});
    
    if (existingUsers.length > 0) {
      // Make users follow random artists
      for (const user of existingUsers) {
        const randomArtists = artists
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.floor(Math.random() * 3) + 2); // Follow 2-4 artists

        user.artistPreferences = user.artistPreferences || {};
        user.artistPreferences.followedArtists = randomArtists.map(artist => ({
          artistId: artist._id,
          followedAt: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          notificationSettings: {
            releases: true,
            news: true,
            tours: true,
            social: false
          }
        }));

        await user.save();
      }
      console.log(`✅ Updated ${existingUsers.length} users with artist follows`);
    } else {
      console.log('⚠️ No existing users found. Users will need to follow artists manually.');
    }

    // Final verification
    const finalCounts = {
      artists: await Artist.countDocuments(),
      updates: await ArtistUpdate.countDocuments(),
      users: await User.countDocuments()
    };

    console.log('\n🎉 DATABASE SEEDING COMPLETE!');
    console.log('============================');
    console.log(`Artists: ${finalCounts.artists}`);
    console.log(`Updates: ${finalCounts.updates}`);
    console.log(`Users: ${finalCounts.users}`);
    console.log('\n✅ The news/buzz screen should now show content!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}

export default seedDatabase;