import mongoose from 'mongoose';

const UserBadgeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  badgeType: {
    type: String,
    enum: ['founder', 'og', 'vip', 'legendary', 'elite', 'premium', 'creator', 'innovator'],
    required: true
  },
  isVisible: {
    type: Boolean,
    default: true
  },
  awardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound index to ensure one badge type per user
UserBadgeSchema.index({ user: 1, badgeType: 1 }, { unique: true });

// Instance method to format badge for API response
UserBadgeSchema.methods.toAPIResponse = function() {
  return {
    id: this._id,
    badgeType: this.badgeType,
    awardedAt: this.createdAt,
    isVisible: this.isVisible,
    metadata: this.metadata
  };
};

// Static method to get user's badges
UserBadgeSchema.statics.getUserBadges = async function(userId) {
  return this.find({ user: userId, isVisible: true })
    .populate('awardedBy', 'username email')
    .sort({ createdAt: -1 });
};

// Static method to award badge
UserBadgeSchema.statics.awardBadge = async function(userId, badgeType, awardedBy = null, metadata = {}) {
  try {
    const badge = new this({
      user: userId,
      badgeType,
      awardedBy,
      metadata
    });
    return await badge.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new Error(`User already has ${badgeType} badge`);
    }
    throw error;
  }
};

export default mongoose.model('UserBadge', UserBadgeSchema);