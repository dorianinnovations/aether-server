import mongoose from 'mongoose';

const UserAnalyticsSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Time period for this analytics snapshot
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly', 'all_time'],
    required: true
  },
  
  // Date range for this period
  dateRange: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  
  // Artist engagement analytics
  artistEngagement: {
    // Total artists followed
    totalArtistsFollowed: {
      type: Number,
      default: 0
    },
    
    // Artists by priority
    artistsByPriority: {
      high: {
        type: Number,
        default: 0
      },
      medium: {
        type: Number,
        default: 0
      },
      low: {
        type: Number,
        default: 0
      }
    },
    
    // Most engaged artists
    topArtists: [{
      artistId: String,
      artistName: String,
      engagementScore: Number,
      interactions: {
        views: Number,
        clicks: Number,
        shares: Number,
        saves: Number
      },
      lastEngagement: Date
    }],
    
    // New artists discovered this period
    newDiscoveries: [{
      artistId: String,
      artistName: String,
      discoveredAt: Date,
      discoverySource: {
        type: String,
        enum: ['recommendation', 'search', 'friend', 'spotify', 'trending']
      }
    }],
    
    // Artists unfollowed this period
    unfollowed: [{
      artistId: String,
      artistName: String,
      unfollowedAt: Date,
      followDuration: Number // days followed before unfollowing
    }]
  },
  
  // Content consumption analytics
  contentConsumption: {
    // Total updates received and viewed
    totalUpdatesReceived: {
      type: Number,
      default: 0
    },
    
    totalUpdatesViewed: {
      type: Number,
      default: 0
    },
    
    // Consumption by content type
    byContentType: {
      releases: {
        received: {
          type: Number,
          default: 0
        },
        viewed: {
          type: Number,
          default: 0
        },
        engaged: {
          type: Number,
          default: 0
        }
      },
      news: {
        received: {
          type: Number,
          default: 0
        },
        viewed: {
          type: Number,
          default: 0
        },
        engaged: {
          type: Number,
          default: 0
        }
      },
      tours: {
        received: {
          type: Number,
          default: 0
        },
        viewed: {
          type: Number,
          default: 0
        },
        engaged: {
          type: Number,
          default: 0
        }
      },
      social: {
        received: {
          type: Number,
          default: 0
        },
        viewed: {
          type: Number,
          default: 0
        },
        engaged: {
          type: Number,
          default: 0
        }
      }
    },
    
    // Daily activity patterns
    dailyActivity: [{
      date: String, // YYYY-MM-DD
      updatesViewed: Number,
      timeSpent: Number, // seconds
      peakActivity: String // hour of day (0-23)
    }],
    
    // Content preferences learned
    preferenceSignals: {
      preferredContentTypes: [String],
      preferredGenres: [String],
      averageEngagementTime: Number, // seconds
      mostActiveHours: [Number] // hours of day (0-23)
    }
  },
  
  // Discovery and recommendation analytics
  discovery: {
    // Recommendation performance
    recommendations: {
      totalReceived: {
        type: Number,
        default: 0
      },
      totalAccepted: {
        type: Number,
        default: 0
      },
      acceptanceRate: {
        type: Number,
        default: 0
      },
      
      // Performance by recommendation type
      byType: {
        similar_artists: {
          received: Number,
          accepted: Number,
          rate: Number
        },
        genre_exploration: {
          received: Number,
          accepted: Number,
          rate: Number
        },
        trending: {
          received: Number,
          accepted: Number,
          rate: Number
        },
        friend_based: {
          received: Number,
          accepted: Number,
          rate: Number
        }
      }
    },
    
    // Discovery patterns
    patterns: {
      discoveriesThisPeriod: {
        type: Number,
        default: 0
      },
      discoveryStreak: {
        type: Number,
        default: 0
      },
      averageTimeBetweenDiscoveries: Number, // days
      mostSuccessfulDiscoveryMethod: String,
      
      // Genre exploration
      genreExploration: {
        newGenresExplored: [String],
        genreDiversityScore: Number, // 0-1
        expandingTaste: Boolean // trending toward more diverse taste
      }
    }
  },
  
  // Listening behavior analytics
  listeningBehavior: {
    // Session patterns
    sessions: {
      totalSessions: {
        type: Number,
        default: 0
      },
      averageSessionLength: Number, // minutes
      longestSession: Number, // minutes
      preferredSessionTimes: [String], // ['morning', 'afternoon', 'evening', 'night']
      
      // Weekly patterns
      weeklyPatterns: {
        mostActiveDay: String,
        leastActiveDay: String,
        weekendVsWeekday: {
          weekend: Number,
          weekday: Number
        }
      }
    },
    
    // Music consumption patterns
    consumption: {
      totalTracksPlayed: {
        type: Number,
        default: 0
      },
      totalListeningTime: Number, // minutes
      averageTrackCompletion: Number, // 0-1 (percentage)
      skipRate: Number, // 0-1
      repeatRate: Number, // 0-1
      
      // Spotify integration metrics
      spotifyMetrics: {
        topTracks: [String],
        topArtists: [String],
        topGenres: [String],
        audioFeatures: {
          averageDanceability: Number,
          averageEnergy: Number,
          averageValence: Number,
          averageTempo: Number
        }
      }
    }
  },
  
  // Engagement quality metrics
  engagement: {
    // Overall engagement health
    health: {
      overallEngagementRate: {
        type: Number,
        default: 0
      },
      contentSatisfactionScore: {
        type: Number,
        default: 0.5,
        min: 0,
        max: 1
      },
      platformStickiness: Number, // how often they return
      churnRisk: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'low'
      }
    },
    
    // Deep engagement metrics
    deepEngagement: {
      sharesToFriends: {
        type: Number,
        default: 0
      },
      commentsLeft: {
        type: Number,
        default: 0
      },
      playlistsCreated: {
        type: Number,
        default: 0
      },
      averageTimePerUpdate: Number, // seconds spent per update
      
      // Quality signals
      qualityEngagements: {
        fullArticleReads: Number,
        fullTrackListens: Number,
        eventAttendanceIntent: Number
      }
    }
  },
  
  // Comparison metrics
  comparisons: {
    // Compare to previous period
    periodOverPeriod: {
      artistsFollowedChange: Number,      // +/- number
      engagementRateChange: Number,       // +/- percentage
      discoveryRateChange: Number,        // +/- percentage
      listeningTimeChange: Number,        // +/- minutes
      contentSatisfactionChange: Number   // +/- score
    },
    
    // Compare to platform averages
    platformComparison: {
      engagementVsAverage: Number,        // multiplier (1.0 = average)
      discoveryVsAverage: Number,         // multiplier
      listeningTimeVsAverage: Number,     // multiplier
      diversityVsAverage: Number          // multiplier
    }
  },
  
  // Predictive insights
  insights: {
    // AI-generated insights about user behavior
    behaviorInsights: [String],
    
    // Predicted preferences
    predictions: {
      likelyToEnjoy: [String],           // genres or artist types
      optimalNotificationTime: String,    // time of day
      churnProbability: Number,          // 0-1
      nextDiscoveryCategory: String
    },
    
    // Personalization recommendations
    recommendations: {
      feedOptimization: String,
      notificationFrequency: String,
      contentTypes: [String]
    }
  },
  
  // Calculation metadata
  metadata: {
    calculatedAt: {
      type: Date,
      default: Date.now
    },
    
    // Data sources used
    dataSources: {
      spotify: Boolean,
      inAppBehavior: Boolean,
      friendData: Boolean,
      externalSources: Boolean
    },
    
    // Data quality metrics
    dataQuality: {
      completeness: Number,    // 0-1
      freshness: Number,       // 0-1 (how recent is the data)
      accuracy: Number         // 0-1 (confidence in data accuracy)
    },
    
    // Processing info
    processingTime: Number,    // milliseconds
    version: {
      type: String,
      default: '1.0'
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
UserAnalyticsSchema.index({ period: 1 });
UserAnalyticsSchema.index({ 'dateRange.start': 1, 'dateRange.end': 1 });
UserAnalyticsSchema.index({ userId: 1, period: 1 });

// Virtual for engagement rate calculation
UserAnalyticsSchema.virtual('overallEngagementRate').get(function() {
  const { totalUpdatesReceived, totalUpdatesViewed } = this.contentConsumption;
  if (totalUpdatesReceived === 0) return 0;
  return totalUpdatesViewed / totalUpdatesReceived;
});

// Method to get summary stats for display
UserAnalyticsSchema.methods.getSummaryStats = function() {
  return {
    artistsFollowed: this.artistEngagement.totalArtistsFollowed,
    newDiscoveries: this.artistEngagement.newDiscoveries.length,
    engagementRate: this.overallEngagementRate,
    listeningTime: this.listeningBehavior.consumption.totalListeningTime,
    contentSatisfaction: this.engagement.health.contentSatisfactionScore,
    topGenres: this.listeningBehavior.consumption.spotifyMetrics.topGenres?.slice(0, 3) || [],
    topArtists: this.artistEngagement.topArtists.slice(0, 5),
    insights: this.insights.behaviorInsights.slice(0, 3)
  };
};

// Method to check if analytics need updating
UserAnalyticsSchema.methods.needsUpdate = function() {
  const now = new Date();
  const lastUpdate = this.metadata.calculatedAt;
  
  // Update frequency by period type
  const updateFrequencies = {
    daily: 24 * 60 * 60 * 1000,      // Update daily stats every 24 hours
    weekly: 24 * 60 * 60 * 1000,     // Update weekly stats daily
    monthly: 7 * 24 * 60 * 60 * 1000, // Update monthly stats weekly
    yearly: 30 * 24 * 60 * 60 * 1000, // Update yearly stats monthly
    all_time: 7 * 24 * 60 * 60 * 1000  // Update all-time stats weekly
  };
  
  const frequency = updateFrequencies[this.period] || updateFrequencies.daily;
  return (now - lastUpdate) > frequency;
};

export default mongoose.model('UserAnalytics', UserAnalyticsSchema);