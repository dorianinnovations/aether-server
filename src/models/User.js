import mongoose from 'mongoose';
import bcrypt from 'bcrypt';


const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    lowercase: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    validate: {
      validator: function(username) {
        // Only allow alphanumeric and underscores
        const validFormat = /^[a-zA-Z0-9_]+$/.test(username);
        
        // Block single letters/numbers (already handled by minlength but double-check)
        const notTooShort = username.length >= 3;
        
        // Block reserved usernames
        const reserved = ['admin', 'root', 'api', 'www', 'mail', 'ftp', 'support', 'help', 'aether', 'system'];
        const notReserved = !reserved.includes(username.toLowerCase());
        
        return validFormat && notTooShort && notReserved;
      },
      message: 'Username must be 3+ characters, alphanumeric/underscore only, and not reserved'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Onboarding state tracking
  onboarding: {
    hasSeenWelcome: {
      type: Boolean,
      default: false
    },
    welcomeShownAt: {
      type: Date
    },
    onboardingCompletedAt: {
      type: Date
    },
    skipWelcomePrompt: {
      type: Boolean,
      default: false
    }
  },
  
  // Friends system
  friends: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['accepted'],
      default: 'accepted'
    },
    
    // Friend-to-friend messaging with GitHub-style heat map tracking
    messagingHistory: {
      // Track daily conversation activity (GitHub-style heat map)
      dailyActivity: [{
        date: {
          type: String, // YYYY-MM-DD format
          required: true
        },
        myMessages: {
          type: Number,
          default: 0
        },
        theirMessages: {
          type: Number,
          default: 0
        },
        totalMessages: {
          type: Number,
          default: 0
        },
        lastActivity: {
          type: Date,
          default: Date.now
        }
      }],
      
      // Current conversation streak (both parties active within 24h)
      activeStreak: {
        isActive: {
          type: Boolean,
          default: false
        },
        startDate: Date,
        lastBothActiveDate: Date, // Last date both sent messages within 24h
        streakDays: {
          type: Number,
          default: 0
        }
      },
      
      // Last messages for context (limited to last 50 to prevent bloat)
      recentMessages: [{
        from: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        content: {
          type: String,
          required: true,
          maxlength: 2000
        },
        timestamp: {
          type: Date,
          default: Date.now
        },
        messageId: {
          type: String,
          required: true,
          unique: true
        },
        readAt: {
          type: Date
        },
        deliveredAt: {
          type: Date,
          default: Date.now
        }
      }],
      
      // Conversation statistics
      stats: {
        totalConversations: {
          type: Number,
          default: 0
        },
        totalMessages: {
          type: Number,
          default: 0
        },
        averageResponseTime: Number, // in minutes
        longestStreak: {
          type: Number,
          default: 0
        },
        firstConversation: Date,
        lastConversation: Date
      }
    }
  }],
  
  // Profile images
  profilePhoto: {
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    uploadedAt: Date
  },
  bannerImage: {
    url: String,
    filename: String,
    size: Number,
    mimeType: String,
    uploadedAt: Date
  },

  // Social Proxy Profile - Living representation of the user
  socialProxy: {
    // Current status and what they're up to
    currentStatus: {
      type: String,
      maxlength: 280,
      default: ''
    },
    currentPlans: {
      type: String,
      maxlength: 500,
      default: ''
    },
    mood: {
      type: String,
      enum: ['excited', 'chill', 'focused', 'social', 'introspective', 'busy', 'available', ''],
      default: ''
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    
    // Spotify integration
    spotify: {
      connected: {
        type: Boolean,
        default: false
      },
      accessToken: String,
      refreshToken: String,
      currentTrack: {
        name: String,
        artist: String,
        album: String,
        imageUrl: String,
        spotifyUrl: String,
        lastPlayed: Date
      },
      recentTracks: [{
        name: String,
        artist: String,
        album: String,
        imageUrl: String,
        spotifyUrl: String,
        playedAt: Date
      }],
      topTracks: [{
        name: String,
        artist: String,
        album: String,
        imageUrl: String,
        spotifyUrl: String,
        timeRange: String // short_term, medium_term, long_term
      }]
    },
    
    // AI personality traits learned from interactions
    personality: {
      interests: [{
        topic: String,
        confidence: Number, // 0-1 score
        lastMentioned: Date,
        category: {
          type: String,
          enum: ['hobby', 'work', 'entertainment', 'learning', 'social', 'health', 'travel', 'technology', 'creative'],
          default: 'hobby'
        }
      }],
      
      communicationStyle: {
        casual: Number,     // 0-1 score for casual vs formal
        energetic: Number,  // 0-1 score for energy level  
        analytical: Number, // 0-1 score for deep vs surface
        social: Number,     // 0-1 score for social engagement
        humor: Number       // 0-1 score for humor usage
      },
      
      // Recent activities and plans
      recentActivities: [{
        activity: String,
        type: {
          type: String,
          enum: ['work', 'hobby', 'social', 'learning', 'health', 'entertainment', 'travel'],
          default: 'hobby'
        },
        confidence: Number,
        timeframe: {
          type: String,
          enum: ['current', 'soon', 'future', 'past'],
          default: 'current'
        },
        detectedAt: {
          type: Date,
          default: Date.now
        }
      }],
      
      // Mood tracking
      moodHistory: [{
        mood: {
          type: String,
          enum: ['excited', 'happy', 'neutral', 'focused', 'stressed', 'tired', 'curious', 'motivated'],
          default: 'neutral'
        },
        energy: Number,     // 0-1 score
        confidence: Number, // 0-1 score
        detectedAt: {
          type: Date,
          default: Date.now
        }
      }],
      
      totalMessages: {
        type: Number,
        default: 0
      },
      
      lastAnalyzed: Date,
      
      // Enhanced analysis metadata
      analysisVersion: {
        type: String,
        default: '3.0'
      },
      
      // Profile quality metrics
      profileCompleteness: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
      },
      
      lastSignificantUpdate: Date
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);