import mongoose from 'mongoose';

const ArtistSchema = new mongoose.Schema({
  // Basic artist information
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  // Unique identifier for the artist
  artistId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  
  // External platform IDs
  externalIds: {
    spotifyId: String,
    lastFmId: String,
    musicBrainzId: String,
    appleMusicId: String,
    youtubeChannelId: String,
    soundcloudId: String
  },
  
  // Artist metadata
  genres: [{
    type: String,
    trim: true
  }],
  
  // Artist bio and description
  bio: {
    type: String,
    maxlength: 2000
  },
  
  // Artist images
  images: {
    large: String,    // 640x640
    medium: String,   // 300x300  
    small: String,    // 64x64
    banner: String    // Banner/header image
  },
  
  // Social media and web presence
  socialLinks: {
    website: String,
    twitter: String,
    instagram: String,
    facebook: String,
    youtube: String,
    soundcloud: String,
    bandcamp: String,
    spotify: String
  },
  
  // Artist activity metrics
  popularity: {
    spotifyPopularity: Number,  // 0-100 from Spotify
    followers: {
      spotify: Number,
      instagram: Number,
      twitter: Number,
      total: Number
    },
    monthlyListeners: Number,
    lastUpdated: Date
  },
  
  // Content tracking
  content: {
    // Track recent releases
    recentReleases: [{
      type: {
        type: String,
        enum: ['album', 'single', 'ep', 'compilation'],
        required: true
      },
      name: {
        type: String,
        required: true
      },
      releaseDate: {
        type: Date,
        required: true
      },
      spotifyId: String,
      imageUrl: String,
      trackCount: Number,
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Track news and updates
    recentNews: [{
      title: {
        type: String,
        required: true,
        maxlength: 300
      },
      summary: {
        type: String,
        maxlength: 1000
      },
      source: String,
      url: String,
      publishedAt: Date,
      addedAt: {
        type: Date,
        default: Date.now
      },
      category: {
        type: String,
        enum: ['news', 'interview', 'review', 'announcement', 'tour', 'collaboration'],
        default: 'news'
      }
    }],
    
    // Tour dates and events
    upcomingEvents: [{
      name: {
        type: String,
        required: true
      },
      venue: String,
      city: String,
      country: String,
      date: Date,
      ticketUrl: String,
      addedAt: {
        type: Date,
        default: Date.now
      },
      eventType: {
        type: String,
        enum: ['concert', 'festival', 'tour', 'virtual'],
        default: 'concert'
      }
    }]
  },
  
  // Platform tracking metadata
  tracking: {
    lastScraped: {
      spotify: Date,
      news: Date,
      social: Date,
      tours: Date
    },
    
    // Content update frequency (how often this artist posts new content)
    updateFrequency: {
      releases: Number,    // Average days between releases
      news: Number,        // Average days between news updates
      social: Number       // Average days between social posts
    },
    
    // Tracking status
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Error tracking
    lastError: {
      message: String,
      timestamp: Date,
      source: String
    },
    
    // Content freshness
    contentFreshness: {
      releases: Date,     // Last new release detected
      news: Date,         // Last new news detected
      events: Date        // Last new event detected
    }
  },
  
  // Analytics and engagement
  analytics: {
    // How many users follow this artist
    followersCount: {
      type: Number,
      default: 0
    },
    
    // Engagement metrics
    engagementMetrics: {
      totalViews: {
        type: Number,
        default: 0
      },
      totalClicks: {
        type: Number,
        default: 0
      },
      totalShares: {
        type: Number,
        default: 0
      },
      averageEngagementRate: {
        type: Number,
        default: 0
      }
    },
    
    // Trending data
    trending: {
      score: {
        type: Number,
        default: 0
      },
      lastCalculated: Date,
      peakDate: Date,
      peakScore: Number
    }
  },
  
  // Content categorization for AI
  aiMetadata: {
    // AI-generated tags and categories
    aiTags: [String],
    
    // Content sentiment analysis
    contentSentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative'],
      default: 'neutral'
    },
    
    // AI summary of recent activity
    activitySummary: {
      type: String,
      maxlength: 500
    },
    
    // Last AI analysis
    lastAnalyzed: Date,
    
    // AI confidence in data quality
    dataQuality: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    }
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
ArtistSchema.index({ name: 'text', bio: 'text' });
ArtistSchema.index({ genres: 1 });
ArtistSchema.index({ 'popularity.spotifyPopularity': -1 });
ArtistSchema.index({ 'analytics.followersCount': -1 });
ArtistSchema.index({ 'tracking.lastScraped.spotify': 1 });
ArtistSchema.index({ 'analytics.trending.score': -1 });

// Virtual for full external URLs
ArtistSchema.virtual('fullSocialLinks').get(function() {
  const links = {};
  if (this.socialLinks.twitter) {
    links.twitter = `https://twitter.com/${this.socialLinks.twitter}`;
  }
  if (this.socialLinks.instagram) {
    links.instagram = `https://instagram.com/${this.socialLinks.instagram}`;
  }
  if (this.socialLinks.spotify && this.externalIds.spotifyId) {
    links.spotify = `https://open.spotify.com/artist/${this.externalIds.spotifyId}`;
  }
  return links;
});

// Method to check if artist needs content update
ArtistSchema.methods.needsUpdate = function(contentType = 'all') {
  const now = new Date();
  const daysSince = (lastUpdate) => {
    if (!lastUpdate) return Infinity;
    return (now - lastUpdate) / (1000 * 60 * 60 * 24);
  };

  const thresholds = {
    releases: 7,  // Check for new releases weekly
    news: 1,      // Check for news daily
    social: 1,    // Check social media daily
    tours: 3      // Check tours every 3 days
  };

  if (contentType === 'all') {
    return Object.keys(thresholds).some(type => 
      daysSince(this.tracking.lastScraped[type]) > thresholds[type]
    );
  }

  return daysSince(this.tracking.lastScraped[contentType]) > thresholds[contentType];
};

// Method to get recent activity summary
ArtistSchema.methods.getRecentActivity = function(days = 7) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const recentReleases = this.content.recentReleases.filter(
    release => release.addedAt >= cutoff
  );
  
  const recentNews = this.content.recentNews.filter(
    news => news.addedAt >= cutoff
  );
  
  const upcomingEvents = this.content.upcomingEvents.filter(
    event => event.date >= new Date()
  ).slice(0, 5); // Next 5 events

  return {
    releases: recentReleases,
    news: recentNews,
    events: upcomingEvents,
    hasActivity: recentReleases.length + recentNews.length > 0
  };
};

export default mongoose.model('Artist', ArtistSchema);