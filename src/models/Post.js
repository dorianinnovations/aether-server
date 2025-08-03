import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  author: {
    type: String,
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorArchetype: {
    type: String,
    enum: ['Analytical', 'Creative', 'Supportive', 'Curious', 'Practical']
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  profilePic: String
}, {
  timestamps: true
});

const postSchema = new mongoose.Schema({
  community: {
    type: String,
    required: true,
    enum: [
      'Analytical Minds',
      'Creative Collective', 
      'Supportive Circle',
      'Curious Thinkers',
      'Practical Minds',
      'Study Group - CS401',
      'Hiking Crew',
      'Cognitive Collective',
      'Mental Frameworks',
      'Thought Experiments',
      'Equal Minds',
      'Peer Learning',
      'Collective Action'
    ]
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  content: {
    type: String,
    maxlength: 2000
  },
  author: {
    type: String,
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorArchetype: {
    type: String,
    enum: ['Analytical', 'Creative', 'Supportive', 'Curious', 'Practical']
  },
  badge: {
    type: String,
    required: true,
    enum: [
      'Tech Share', 'Design', 'Community', 'Discussion', 'Life Tips',
      'Study Group', 'Adventure', 'Strategy', 'Framework', 'Experiment',
      'Co-Create', 'Exchange', 'Milestone', 'Question', 'Resource',
      'Breakthrough'
    ]
  },
  image: String,
  engagement: {
    type: Number,
    default: 0
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  likesCount: {
    type: Number,
    default: 0
  },
  commentsCount: {
    type: Number,
    default: 0
  },
  sharesCount: {
    type: Number,
    default: 0
  },
  comments: [commentSchema],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Add text index for search functionality
postSchema.index({
  title: 'text',
  content: 'text',
  community: 'text',
  author: 'text',
  badge: 'text'
});

// Virtual for time ago display
postSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
});

// Middleware to update counts
postSchema.pre('save', function(next) {
  // Update likes count
  this.likesCount = this.likes.length;
  
  // Update comments count
  this.commentsCount = this.comments.length;
  
  // Update legacy engagement field (for backward compatibility)
  this.engagement = this.likesCount + this.commentsCount;
  
  next();
});

// Include virtuals in JSON output
postSchema.set('toJSON', { virtuals: true });

const Post = mongoose.model('Post', postSchema);

export default Post;