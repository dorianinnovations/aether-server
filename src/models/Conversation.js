import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    default: 'New Conversation'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    attachments: [{
      type: {
        type: String,
        enum: ['image', 'document', 'file']
      },
      name: String,
      uri: String,
      mimeType: String,
      size: Number
    }],
    metadata: {
      model: String,
      tier: String,
      responseTime: Number,
      tokenCount: Number,
      toolsUsed: [String],
      reasoning: String
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  messageCount: {
    type: Number,
    default: 0
  },
  tags: [String],
  summary: String
}, {
  timestamps: true
});

// Index for efficient queries
ConversationSchema.index({ user: 1, lastMessageAt: -1 });
ConversationSchema.index({ user: 1, isActive: 1 });

// Update lastMessageAt and messageCount when messages are added
ConversationSchema.pre('save', function(next) {
  if (this.messages && this.messages.length > 0) {
    this.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
    this.messageCount = this.messages.length;
  }
  next();
});

// Virtual for getting recent messages
ConversationSchema.virtual('recentMessages').get(function() {
  return this.messages.slice(-50); // Last 50 messages
});

export default mongoose.model('Conversation', ConversationSchema);