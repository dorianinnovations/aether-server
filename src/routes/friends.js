/**
 * Friends Routes
 * API endpoints for friend connections and friend ID management
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /friends/my-id - Get current user's friend ID
 */
router.get('/my-id', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId, 'friendId username');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      friendId: user.friendId,
      username: user.username
    });
    
  } catch (error) {
    log.error('Get friend ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get friend ID'
    });
  }
});

/**
 * GET /friends/lookup/:friendId - Look up a user by friend ID
 */
router.get('/lookup/:friendId', protect, async (req, res) => {
  try {
    const { friendId } = req.params;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        error: 'Friend ID is required'
      });
    }
    
    const user = await User.findOne({ friendId }, 'friendId username name profile.interests');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User with that friend ID not found'
      });
    }
    
    // Return safe public info
    const publicProfile = {
      friendId: user.friendId,
      username: user.username,
      name: user.name,
      topInterests: user.profile?.interests
        ?.filter(i => i.confidence > 0.6)
        ?.slice(0, 3)
        ?.map(i => i.topic) || []
    };
    
    res.json({
      success: true,
      user: publicProfile
    });
    
  } catch (error) {
    log.error('Friend lookup error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup friend'
    });
  }
});

/**
 * POST /friends/add - Add friend by friend ID
 */
router.post('/add', protect, async (req, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.id;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        error: 'Friend ID is required'
      });
    }
    
    // Find the target user
    const targetUser = await User.findOne({ friendId });
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User with that friend ID not found'
      });
    }
    
    // Can't add yourself
    if (targetUser._id.toString() === currentUserId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot add yourself as a friend'
      });
    }
    
    // Get current user
    const currentUser = await User.findById(currentUserId);
    
    // Check if already friends
    const alreadyFriends = currentUser.friends.some(
      friend => friend.user.toString() === targetUser._id.toString()
    );
    
    if (alreadyFriends) {
      return res.status(400).json({
        success: false,
        error: 'Already friends with this user'
      });
    }
    
    // Add each other as friends (mutual friendship)
    currentUser.friends.push({
      user: targetUser._id,
      status: 'accepted'
    });
    
    targetUser.friends.push({
      user: currentUser._id,
      status: 'accepted'
    });
    
    await currentUser.save();
    await targetUser.save();
    
    res.json({
      success: true,
      message: `Successfully added ${targetUser.username} as a friend!`,
      friend: {
        friendId: targetUser.friendId,
        username: targetUser.username,
        addedAt: new Date()
      }
    });
    
  } catch (error) {
    log.error('Add friend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add friend'
    });
  }
});

/**
 * GET /friends/list - Get current user's friends list
 */
router.get('/list', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId)
      .populate('friends.user', 'friendId username name profile.interests')
      .select('friends');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const friendsList = user.friends.map(friendship => ({
      friendId: friendship.user.friendId,
      username: friendship.user.username,
      name: friendship.user.name,
      addedAt: friendship.addedAt,
      topInterests: friendship.user.profile?.interests
        ?.filter(i => i.confidence > 0.6)
        ?.slice(0, 3)
        ?.map(i => i.topic) || []
    }));
    
    res.json({
      success: true,
      friends: friendsList,
      totalFriends: friendsList.length
    });
    
  } catch (error) {
    log.error('Friends list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get friends list'
    });
  }
});

/**
 * DELETE /friends/remove - Remove a friend by friend ID
 */
router.delete('/remove', protect, async (req, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.id;
    
    if (!friendId) {
      return res.status(400).json({
        success: false,
        error: 'Friend ID is required'
      });
    }
    
    // Find the target user
    const targetUser = await User.findOne({ friendId });
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User with that friend ID not found'
      });
    }
    
    // Get current user and remove friendship from both sides
    const currentUser = await User.findById(currentUserId);
    
    // Remove from current user's friends list
    currentUser.friends = currentUser.friends.filter(
      friend => friend.user.toString() !== targetUser._id.toString()
    );
    
    // Remove from target user's friends list
    targetUser.friends = targetUser.friends.filter(
      friend => friend.user.toString() !== currentUser._id.toString()
    );
    
    await currentUser.save();
    await targetUser.save();
    
    res.json({
      success: true,
      message: `Removed ${targetUser.username} from friends`
    });
    
  } catch (error) {
    log.error('Remove friend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove friend'
    });
  }
});

export default router;