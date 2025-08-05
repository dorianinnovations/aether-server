import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import spotifyService from '../services/spotifyService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get user's social proxy profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username name socialProxy');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      profile: {
        username: user.username,
        name: user.name,
        ...user.socialProxy
      }
    });
  } catch (error) {
    log.error('Get social proxy profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update social proxy status
router.post('/status', protect, async (req, res) => {
  try {
    const { currentStatus, currentPlans, mood } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update status
    if (currentStatus !== undefined) {
      user.socialProxy.currentStatus = currentStatus;
    }
    if (currentPlans !== undefined) {
      user.socialProxy.currentPlans = currentPlans;
    }
    if (mood !== undefined) {
      user.socialProxy.mood = mood;
    }
    
    user.socialProxy.lastUpdated = new Date();
    await user.save();

    // Create activity entries for significant updates
    const activities = [];
    
    if (currentStatus && currentStatus.trim()) {
      activities.push({
        user: user._id,
        type: 'status_update',
        content: { text: currentStatus },
        visibility: 'friends'
      });
    }
    
    if (currentPlans && currentPlans.trim()) {
      activities.push({
        user: user._id,
        type: 'plans_update',
        content: { text: currentPlans },
        visibility: 'friends'
      });
    }
    
    if (mood) {
      activities.push({
        user: user._id,
        type: 'mood_update',
        content: { 
          text: `Feeling ${mood}`,
          metadata: { mood }
        },
        visibility: 'friends'
      });
    }

    if (activities.length > 0) {
      await Activity.insertMany(activities);
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      socialProxy: user.socialProxy
    });
  } catch (error) {
    log.error('Update social proxy status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Get friend timeline (social feed)
router.get('/timeline', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const user = await User.findById(req.user.id).populate('friends.user', 'username');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get friend user IDs
    const friendIds = user.friends.map(friend => friend.user._id);
    friendIds.push(user._id); // Include own activities

    // Get activities from friends and self
    const activities = await Activity.find({
      user: { $in: friendIds },
      visibility: { $in: ['public', 'friends'] }
    })
    .populate('user', 'username name')
    .populate('reactions.user', 'username')
    .populate('comments.user', 'username')
    .sort({ createdAt: -1 })
    .limit(limit * page)
    .skip((page - 1) * limit);

    res.json({
      success: true,
      timeline: activities,
      hasMore: activities.length === limit * page
    });
  } catch (error) {
    log.error('Get timeline error:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

// Get specific friend's social proxy
router.get('/friend/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    const currentUser = await User.findById(req.user.id);
    
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find the friend
    const friend = await User.findOne({ username: username.toLowerCase() })
      .select('username name socialProxy');
    
    if (!friend) {
      return res.status(404).json({ error: 'Friend not found' });
    }

    // Check if they're actually friends
    const isFriend = currentUser.friends.some(f => f.user.toString() === friend._id.toString());
    
    if (!isFriend) {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    // Get recent activities from this friend
    const activities = await Activity.find({
      user: friend._id,
      visibility: { $in: ['public', 'friends'] }
    })
    .populate('user', 'username name')
    .sort({ createdAt: -1 })
    .limit(10);

    res.json({
      success: true,
      friend: {
        username: friend.username,
        name: friend.name,
        socialProxy: friend.socialProxy,
        recentActivities: activities
      }
    });
  } catch (error) {
    log.error('Get friend social proxy error:', error);
    res.status(500).json({ error: 'Failed to get friend profile' });
  }
});

// React to an activity
router.post('/activity/:activityId/react', protect, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { type } = req.body; // like, love, laugh, curious, relate
    
    if (!['like', 'love', 'laugh', 'curious', 'relate'].includes(type)) {
      return res.status(400).json({ error: 'Invalid reaction type' });
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    // Check if user already reacted
    const existingReaction = activity.reactions.find(r => r.user.toString() === req.user.id);
    
    if (existingReaction) {
      // Update existing reaction
      existingReaction.type = type;
      existingReaction.timestamp = new Date();
    } else {
      // Add new reaction
      activity.reactions.push({
        user: req.user.id,
        type,
        timestamp: new Date()
      });
    }

    await activity.save();

    res.json({
      success: true,
      message: 'Reaction added successfully',
      reactions: activity.reactions
    });
  } catch (error) {
    log.error('React to activity error:', error);
    res.status(500).json({ error: 'Failed to react to activity' });
  }
});

// Comment on an activity
router.post('/activity/:activityId/comment', protect, async (req, res) => {
  try {
    const { activityId } = req.params;
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    activity.comments.push({
      user: req.user.id,
      text: text.trim(),
      timestamp: new Date()
    });

    await activity.save();
    await activity.populate('comments.user', 'username');

    res.json({
      success: true,
      message: 'Comment added successfully',
      comments: activity.comments
    });
  } catch (error) {
    log.error('Comment on activity error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

export default router;