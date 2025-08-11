import mongoose from 'mongoose';

const ArtistUpdateSchema = new mongoose.Schema({
  // Reference to the artist
  artistId: {
    type: String,
    required: true,
    ref: 'Artist'
  },
  
  artistName: {
    type: String,
    required: true
  },
  
  // Update content and metadata
  updateType: {
    type: String,
    enum: ['release', 'news', 'tour', 'social', 'interview', 'collaboration', 'announcement'],
    required: true
  },
  
  title: {
    type: String,
    required: true,
    maxlength: 300
  },
  
  description: {
    type: String,
    maxlength: 2000
  },
  
  // Content details
  content: {
    // For releases
    releaseInfo: {
      type: {
        type: String,
        enum: ['album', 'single', 'ep', 'compilation', 'remix']
      },
      releaseDate: Date,
      trackCount: Number,
      duration: Number, // in seconds
      label: String,
      spotifyId: String,
      appleMusicId: String,
      genres: [String],
      collaborators: [String]
    },
    
    // For tours/events
    eventInfo: {
      venue: String,
      city: String,
      country: String,
      date: Date,
      ticketUrl: String,
      price: {
        min: Number,
        max: Number,
        currency: String
      },
      eventType: {
        type: String,
        enum: ['concert', 'festival', 'tour_announcement', 'virtual_event']
      }
    },
    
    // For news/interviews
    articleInfo: {
      source: String,
      author: String,
      publishedAt: Date,
      url: String,
      category: {
        type: String,
        enum: ['interview', 'review', 'news', 'feature', 'announcement']
      },
      sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative'],
        default: 'neutral'
      }
    },
    
    // For social media updates
    socialInfo: {
      platform: {
        type: String,
        enum: ['twitter', 'instagram', 'facebook', 'youtube', 'tiktok']
      },
      postId: String,
      url: String,
      engagement: {
        likes: Number,
        shares: Number,
        comments: Number
      }
    }
  },
  
  // Media attachments
  media: {
    images: [{
      url: String,
      type: {
        type: String,
        enum: ['cover_art', 'photo', 'poster', 'thumbnail'],
        default: 'photo'
      },
      width: Number,
      height: Number
    }],
    
    videos: [{
      url: String,
      platform: String,
      thumbnail: String,
      duration: Number
    }],
    
    audio: [{
      url: String,
      platform: String,
      duration: Number,
      type: {
        type: String,
        enum: ['preview', 'full_track', 'snippet']
      }
    }]
  },
  
  // Targeting and relevance
  targeting: {
    // Which users should see this update
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5
    },
    
    // Geographic targeting
    regions: [String],
    
    // Fan tier targeting
    fanTiers: [{
      type: String,
      enum: ['casual', 'regular', 'superfan', 'all'],
      default: 'all'
    }],
    
    // Content freshness
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    }
  },
  
  // Distribution tracking
  distribution: {
    // When this update was published by the artist
    originalPublishDate: {
      type: Date,
      required: true
    },
    
    // When we discovered/ingested this update
    discoveredAt: {
      type: Date,
      default: Date.now
    },
    
    // When we started distributing to users
    distributionStarted: Date,
    
    // Distribution stats
    stats: {
      usersNotified: {
        type: Number,
        default: 0
      },
      usersEngaged: {
        type: Number,
        default: 0
      },
      clickThroughRate: {
        type: Number,
        default: 0
      },
      averageEngagementTime: Number, // seconds
      totalViews: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Content processing
  processing: {
    // AI content analysis
    aiAnalysis: {
      summary: String,
      sentiment: {
        type: String,
        enum: ['positive', 'neutral', 'negative'],
        default: 'neutral'
      },
      topics: [String],
      keywords: [String],
      importance: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      }
    },
    
    // Content quality checks
    quality: {
      hasValidMedia: {
        type: Boolean,
        default: false
      },
      hasValidLinks: {
        type: Boolean,
        default: false
      },
      contentLength: Number,
      qualityScore: {
        type: Number,
        min: 0,
        max: 1,
        default: 0.5
      }
    },
    
    // Processing status
    status: {
      type: String,
      enum: ['pending', 'processing', 'processed', 'distributed', 'archived', 'failed'],
      default: 'pending'
    },
    
    processedAt: Date,
    
    // Error handling
    errors: [{
      type: String,
      message: String,
      timestamp: Date
    }]
  },
  
  // User engagement tracking
  engagement: {
    // Which users have seen this update
    viewedBy: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      viewedAt: Date,
      source: {
        type: String,
        enum: ['feed', 'notification', 'search', 'direct'],
        default: 'feed'
      }
    }],
    
    // User interactions
    interactions: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      type: {
        type: String,
        enum: ['click', 'share', 'save', 'like', 'comment'],
        required: true
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      metadata: mongoose.Schema.Types.Mixed
    }],
    
    // Aggregate engagement metrics
    totalEngagements: {
      type: Number,
      default: 0
    },
    
    engagementRate: {
      type: Number,
      default: 0
    },
    
    lastEngagement: Date
  },
  
  // Content lifecycle
  lifecycle: {
    isActive: {
      type: Boolean,
      default: true
    },
    
    // When this update expires/becomes less relevant
    expiresAt: Date,
    
    // Archive status
    isArchived: {
      type: Boolean,
      default: false
    },
    
    archivedAt: Date,
    
    // Deletion tracking
    isDeleted: {
      type: Boolean,
      default: false
    },
    
    deletedAt: Date,
    deletionReason: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
ArtistUpdateSchema.index({ artistId: 1 });
ArtistUpdateSchema.index({ updateType: 1 });
ArtistUpdateSchema.index({ 'distribution.originalPublishDate': -1 });
ArtistUpdateSchema.index({ 'targeting.priority': 1 });
ArtistUpdateSchema.index({ 'processing.status': 1 });
ArtistUpdateSchema.index({ 'lifecycle.isActive': 1 });
ArtistUpdateSchema.index({ 'targeting.relevanceScore': -1 });

// Compound indexes
ArtistUpdateSchema.index({ 
  artistId: 1, 
  'distribution.originalPublishDate': -1 
});
ArtistUpdateSchema.index({ 
  'lifecycle.isActive': 1, 
  'targeting.priority': 1,
  'distribution.originalPublishDate': -1 
});

// Virtual for engagement rate calculation
ArtistUpdateSchema.virtual('calculatedEngagementRate').get(function() {
  if (this.distribution.stats.usersNotified === 0) return 0;
  return this.distribution.stats.usersEngaged / this.distribution.stats.usersNotified;
});

// Method to check if update is still relevant
ArtistUpdateSchema.methods.isRelevant = function() {
  if (!this.lifecycle.isActive || this.lifecycle.isArchived) return false;
  if (this.lifecycle.expiresAt && new Date() > this.lifecycle.expiresAt) return false;
  
  // Different types have different relevance windows
  const now = new Date();
  const publishDate = this.distribution.originalPublishDate;
  const daysSince = (now - publishDate) / (1000 * 60 * 60 * 24);
  
  const relevanceWindows = {
    release: 30,        // Releases relevant for 30 days
    news: 7,           // News relevant for 7 days
    tour: 90,          // Tour announcements relevant for 90 days
    social: 3,         // Social posts relevant for 3 days
    interview: 14,     // Interviews relevant for 14 days
    collaboration: 21, // Collaborations relevant for 21 days
    announcement: 14   // Announcements relevant for 14 days
  };
  
  const window = relevanceWindows[this.updateType] || 7;
  return daysSince <= window;
};

// Method to get formatted content for display
ArtistUpdateSchema.methods.getDisplayContent = function() {
  const baseContent = {
    id: this._id,
    artistId: this.artistId,
    artistName: this.artistName,
    type: this.updateType,
    title: this.title,
    description: this.description,
    publishedAt: this.distribution.originalPublishDate,
    media: this.media,
    priority: this.targeting.priority
  };
  
  // Add type-specific content
  switch (this.updateType) {
    case 'release':
      return {
        ...baseContent,
        releaseInfo: this.content.releaseInfo
      };
    case 'tour':
      return {
        ...baseContent,
        eventInfo: this.content.eventInfo
      };
    case 'news':
    case 'interview':
      return {
        ...baseContent,
        articleInfo: this.content.articleInfo
      };
    case 'social':
      return {
        ...baseContent,
        socialInfo: this.content.socialInfo
      };
    default:
      return baseContent;
  }
};

export default mongoose.model('ArtistUpdate', ArtistUpdateSchema);