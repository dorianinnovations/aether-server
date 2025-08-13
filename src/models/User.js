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
  displayName: {
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
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  location: {
    type: String,
    trim: true,
    maxlength: 100
  },
  website: {
    type: String,
    trim: true,
    maxlength: 200
  },
  socialLinks: {
    instagram: {
      type: String,
      trim: true,
      maxlength: 100
    },
    x: {
      type: String,
      trim: true,
      maxlength: 100
    },
    spotify: {
      type: String,
      trim: true,
      maxlength: 200
    },
    facebook: {
      type: String,
      trim: true,
      maxlength: 100
    },
    website: {
      type: String,
      trim: true,
      maxlength: 200
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

  // User badges for profile display - aligned with tier system
  badges: [{
    id: {
      type: String,
      required: true
    },
    badgeType: {
      type: String,
      enum: ['Standard', 'Legendary', 'VIP'],
      required: true
    },
    isVisible: {
      type: Boolean,
      default: true
    },
    awardedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Artist Preferences & Music Profile - Core user music identity
  artistPreferences: {
    // Music taste profile
    musicTaste: {
      favoriteGenres: [{
        name: String,
        confidence: {
          type: Number,
          min: 0,
          max: 1
        },
        lastUpdated: Date
      }],
      discoveryPreferences: {
        openToNewGenres: {
          type: Boolean,
          default: true
        },
        preferSimilarArtists: {
          type: Boolean,
          default: true
        },
        discoverFromFriends: {
          type: Boolean,
          default: false
        }
      },
      listeningPatterns: {
        averageSessionLength: Number, // minutes
        preferredListeningTimes: [String], // e.g., ['morning', 'evening']
        mostActiveDay: String, // e.g., 'friday'
        diversityScore: Number // 0-1, how varied their music taste is
      }
    },
    
    // Feed customization
    feedPreferences: {
      contentTypes: {
        releases: {
          type: Boolean,
          default: true
        },
        news: {
          type: Boolean,
          default: true
        },
        tours: {
          type: Boolean,
          default: true
        },
        social: {
          type: Boolean,
          default: false
        },
        interviews: {
          type: Boolean,
          default: false
        }
      },
      updateFrequency: {
        type: String,
        enum: ['realtime', 'daily', 'weekly'],
        default: 'daily'
      },
      maxUpdatesPerDay: {
        type: Number,
        default: 20,
        min: 1,
        max: 100
      }
    }
  },
  
  // User Analytics & Statistics
  analytics: {
    // Listening statistics
    listeningStats: {
      totalUpdatesReceived: {
        type: Number,
        default: 0
      },
      totalReleasesDiscovered: {
        type: Number,
        default: 0
      },
      averageUpdatesPerDay: {
        type: Number,
        default: 0
      }
    },
    
    // Engagement metrics
    engagement: {
      feedInteractions: [{
        date: String, // YYYY-MM-DD
        views: {
          type: Number,
          default: 0
        },
        clicks: {
          type: Number,
          default: 0
        },
        shares: {
          type: Number,
          default: 0
        }
      }],
      mostEngagedArtists: [{
        artistId: String,
        artistName: String,
        engagementScore: Number,
        lastEngagement: Date
      }],
      discoveryPatterns: {
        discoveriesThisMonth: {
          type: Number,
          default: 0
        },
        discoveryStreak: {
          type: Number,
          default: 0
        },
        lastDiscovery: Date
      }
    },
    
    // Preference evolution tracking
    tasteEvolution: [{
      date: Date,
      snapshot: {
        topGenres: [String],
        topArtists: [String],
        diversityScore: Number
      }
    }]
  },

  // Music Profile Integration - Simplified for artist platform
  musicProfile: {
    // Current listening status for artist discovery
    currentStatus: {
      type: String,
      maxlength: 280,
      default: ''
    },
    mood: {
      type: String,
      enum: ['discovering', 'focused', 'social', 'introspective', 'exploring', 'nostalgic', ''],
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
      }],
      
      // User's all-time favorite songs and albums (Grails)
      grails: {
        topTracks: [{
          id: String,
          name: String,
          artist: String,
          album: String,
          imageUrl: String,
          spotifyUrl: String
        }],
        topAlbums: [{
          id: String,
          name: String,
          artist: String,
          imageUrl: String,
          spotifyUrl: String,
          releaseDate: String
        }]
      }
    },
    
    // Music-focused AI personality traits
    musicPersonality: {
      // Music interests and preferences
      musicInterests: [{
        genre: String,
        confidence: Number, // 0-1 score
        lastMentioned: Date,
        category: {
          type: String,
          enum: ['favorite', 'exploring', 'occasional', 'dislike'],
          default: 'favorite'
        }
      }],
      
      // Music discovery style
      discoveryStyle: {
        adventurous: Number,    // 0-1 score for trying new genres
        social: Number,         // 0-1 score for friend-based discovery
        algorithmic: Number,    // 0-1 score for AI recommendations
        nostalgic: Number,      // 0-1 score for rediscovering old music
        trendy: Number          // 0-1 score for following current trends
      },
      
      // Recent music activities
      recentMusicActivities: [{
        activity: String,
        type: {
          type: String,
          enum: ['listening', 'discovering', 'sharing', 'concert', 'playlist_making'],
          default: 'listening'
        },
        confidence: Number,
        detectedAt: {
          type: Date,
          default: Date.now
        }
      }],
      
      totalMusicInteractions: {
        type: Number,
        default: 0
      },
      
      lastMusicAnalyzed: Date,
      
      // Music profile metadata
      analysisVersion: {
        type: String,
        default: '4.0'
      },
      
      // Music profile completeness
      musicProfileCompleteness: {
        type: Number,
        default: 0,
        min: 0,
        max: 1
      }
    }
  },

  // User tier system with GPT-5 usage tracking
  tier: {
    type: String,
    enum: ['free', 'Standard', 'Legend', 'VIP'],
    default: 'Standard'
  },
  
  // GPT-5 usage tracking
  gpt5Usage: {
    // Monthly usage tracking
    currentMonth: {
      type: String, // YYYY-MM format
      default: () => new Date().toISOString().slice(0, 7)
    },
    monthlyCount: {
      type: Number,
      default: 0
    },
    // Track last reset to handle month rollover
    lastReset: {
      type: Date,
      default: Date.now
    },
    // Lifetime usage for analytics
    totalUsage: {
      type: Number,
      default: 0
    }
  },

  // Bi-weekly response usage tracking for tier limits
  responseUsage: {
    currentPeriod: {
      type: String, // YYYY-MM-DD format (start of 2-week period)
      default: () => new Date().toISOString().slice(0, 10)
    },
    periodCount: {
      type: Number,
      default: 0
    },
    lastReset: {
      type: Date,
      default: Date.now
    },
    totalResponses: {
      type: Number,
      default: 0
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