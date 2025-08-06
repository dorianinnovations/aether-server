import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  type: {
    type: String,
    enum: [
      'status_update',      // Updated current status
      'plans_update',       // Updated current plans  
      'mood_update',        // Changed mood
      'spotify_track',      // Currently playing track
      'spotify_discovery',  // New favorite song/album
      'ai_interaction',     // Had interesting AI conversation
      'profile_update',     // Updated profile info
      'friend_added',       // Added new friend
      'post'                // User-created post for feed
    ],
    required: true
  },
  
  content: {
    text: String,           // Text content of the update
    metadata: {             // Type-specific data
      track: {              // For spotify activities
        name: String,
        artist: String,
        album: String,
        imageUrl: String,
        spotifyUrl: String
      },
      mood: String,         // For mood updates
      friendUsername: String // For friend activities
    }
  },
  
  // Visibility control
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'friends'
  },
  
  // Engagement
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['like', 'love', 'laugh', 'curious', 'relate']
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  comments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: {
      type: String,
      maxlength: 500
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Index for efficient timeline queries
ActivitySchema.index({ user: 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });
ActivitySchema.index({ visibility: 1, createdAt: -1 });

export default mongoose.model('Activity', ActivitySchema);