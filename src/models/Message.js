import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['user', 'ai'],
    default: 'user'
  },
  aiModel: {
    type: String,
    default: 'claude-3-haiku'
  }
}, {
  timestamps: true
});

export default mongoose.model('Message', MessageSchema);