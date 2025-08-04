import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Generate unique friend ID
function generateFriendId() {
  const adjectives = ['cool', 'epic', 'lunar', 'cyber', 'neon', 'void', 'nova', 'echo'];
  const nouns = ['wolf', 'phoenix', 'ghost', 'blade', 'storm', 'sage', 'knight', 'raven'];
  const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNum = Math.floor(Math.random() * 9999) + 1000;
  return `${randomAdj}_${randomNoun}_${randomNum}`;
}

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
  friendId: {
    type: String,
    unique: true,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true
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
    }
  }],
  
  // Profile analysis data
  profile: {
    interests: [{
      topic: String,
      confidence: Number, // 0-1 score
      lastMentioned: Date
    }],
    
    communicationStyle: {
      casual: Number,     // 0-1 score for casual vs formal
      energetic: Number,  // 0-1 score for energy level  
      analytical: Number, // 0-1 score for deep vs surface
      social: Number,     // 0-1 score for social engagement
      humor: Number       // 0-1 score for humor usage
    },
    
    totalMessages: {
      type: Number,
      default: 0
    },
    
    lastAnalyzed: Date,
    
    // For matching
    compatibilityTags: [String], // Simple tags for matching
    
    // Analysis metadata
    analysisVersion: {
      type: String,
      default: '1.0'
    }
  }
}, {
  timestamps: true
});

// Hash password and generate friend ID before saving
UserSchema.pre('save', async function(next) {
  // Generate friend ID for new users
  if (this.isNew && !this.friendId) {
    let friendId;
    let isUnique = false;
    
    // Keep generating until we get a unique ID
    while (!isUnique) {
      friendId = generateFriendId();
      const existing = await mongoose.model('User').findOne({ friendId });
      if (!existing) {
        isUnique = true;
      }
    }
    
    this.friendId = friendId;
  }
  
  // Hash password if modified
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', UserSchema);