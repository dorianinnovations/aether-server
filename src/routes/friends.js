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
 * GET /friends/my-username - Get current user's username (friend ID)
 */
router.get('/my-username', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId, 'username');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      username: user.username,
      friendId: user.username // For backward compatibility
    });
    
  } catch (error) {
    log.error('Get username error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get username'
    });
  }
});

/**
 * GET /friends/my-id - Get current user's username (backward compatibility)
 */
router.get('/my-id', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId, 'username');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      friendId: user.username,
      username: user.username
    });
    
  } catch (error) {
    log.error('Get username error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get username'
    });
  }
});

/**
 * GET /friends/lookup/:username - Look up a user by username
 */
router.get('/lookup/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    const user = await User.findOne({ username: username.toLowerCase() }, 'username name profile.interests');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User with that username not found'
      });
    }
    
    // Return safe public info
    const publicProfile = {
      username: user.username,
      friendId: user.username, // For backward compatibility
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
 * POST /friends/add - Add friend by username
 */
router.post('/add', protect, async (req, res) => {
  try {
    const { username, friendId } = req.body; // Accept both for backward compatibility
    const friendUsername = username || friendId;
    const currentUserId = req.user.id;
    
    if (!friendUsername) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    // Find the target user
    const targetUser = await User.findOne({ username: friendUsername.toLowerCase() });
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User with that username not found'
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
        username: targetUser.username,
        friendId: targetUser.username, // For backward compatibility
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
      .populate('friends.user', 'username name profile.interests profilePhoto')
      .select('friends');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Check for and log null/invalid friendships
    const invalidFriendships = user.friends.filter(friendship => !friendship.user || !friendship.user.username);
    if (invalidFriendships.length > 0) {
      console.warn(`Found ${invalidFriendships.length} invalid friendships for user ${userId}`, 
        invalidFriendships.map(f => f._id));
    }
    
    const friendsList = user.friends
      .filter(friendship => friendship.user && friendship.user.username) // Filter out null/invalid users
      .map(friendship => ({
        username: friendship.user.username,
        friendId: friendship.user.username, // For backward compatibility
        name: friendship.user.name,
        avatar: friendship.user.profilePhoto?.url || null,
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
 * DELETE /friends/remove - Remove a friend by username
 */
router.delete('/remove', protect, async (req, res) => {
  try {
    const { username, friendId } = req.body; // Accept both for backward compatibility
    const friendUsername = username || friendId;
    const currentUserId = req.user.id;
    
    if (!friendUsername) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    // Find the target user
    const targetUser = await User.findOne({ username: friendUsername.toLowerCase() });
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User with that username not found'
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

/**
 * GET /friends/requests - Get friend requests (placeholder)
 * Note: Currently using direct mutual friendship without requests
 */
router.get('/requests', protect, async (req, res) => {
  try {
    // For now, return empty array since we use direct mutual friendship
    res.json({
      success: true,
      requests: [],
      message: "This system uses direct mutual friendship - no requests needed"
    });
  } catch (error) {
    log.error('Friend requests error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get friend requests'
    });
  }
});

export default router;