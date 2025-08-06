/**
 * Friend Messaging Routes
 * API endpoints for friend-to-friend messaging with heat map tracking
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import friendMessagingService from '../services/friendMessagingService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * POST /friend-messaging/send - Send message to a friend
 */
router.post('/send', protect, async (req, res) => {
  try {
    const { toUsername, content } = req.body;
    const fromUserId = req.user.id;
    
    if (!toUsername || !content) {
      return res.status(400).json({
        success: false,
        error: 'Username and message content are required'
      });
    }
    
    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Message too long (max 2000 characters)'
      });
    }
    
    const result = await friendMessagingService.sendMessage(
      fromUserId, 
      toUsername, 
      content
    );
    
    res.json({
      success: true,
      message: 'Message sent successfully',
      data: result
    });
    
  } catch (error) {
    log.error('Send message error:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (error.message === 'Not friends with this user') {
      return res.status(403).json({
        success: false,
        error: 'You can only message friends'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

/**
 * GET /friend-messaging/conversation/:username - Get conversation history with a friend
 */
router.get('/conversation/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 50 } = req.query;
    const userId = req.user.id;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    const conversation = await friendMessagingService.getConversationHistory(
      userId,
      username,
      parseInt(limit)
    );
    
    res.json({
      success: true,
      conversation
    });
    
  } catch (error) {
    log.error('Get conversation error:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (error.message === 'Not friends with this user') {
      return res.status(403).json({
        success: false,
        error: 'You can only view conversations with friends'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get conversation'
    });
  }
});

/**
 * GET /friend-messaging/conversations - Get all active conversations
 */
router.get('/conversations', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const conversations = await friendMessagingService.getActiveConversations(userId);
    
    res.json({
      success: true,
      conversations,
      total: conversations.length
    });
    
  } catch (error) {
    log.error('Get conversations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversations'
    });
  }
});

/**
 * GET /friend-messaging/heat-map/:username - Get GitHub-style heat map data for a friendship
 */
router.get('/heat-map/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.user.id;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    const conversation = await friendMessagingService.getConversationHistory(
      userId,
      username,
      0 // We only need heat map data, not messages
    );
    
    res.json({
      success: true,
      heatMap: conversation.heatMapData,
      streak: conversation.streak,
      stats: conversation.stats
    });
    
  } catch (error) {
    log.error('Get heat map error:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (error.message === 'Not friends with this user') {
      return res.status(403).json({
        success: false,
        error: 'You can only view heat maps with friends'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get heat map'
    });
  }
});

/**
 * GET /friend-messaging/stats/:username - Get messaging statistics with a friend
 */
router.get('/stats/:username', protect, async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.user.id;
    
    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }
    
    const conversation = await friendMessagingService.getConversationHistory(
      userId,
      username,
      0 // We only need stats, not messages
    );
    
    res.json({
      success: true,
      stats: conversation.stats,
      streak: conversation.streak,
      friend: username
    });
    
  } catch (error) {
    log.error('Get messaging stats error:', error);
    
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (error.message === 'Not friends with this user') {
      return res.status(403).json({
        success: false,
        error: 'You can only view stats with friends'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to get messaging stats'
    });
  }
});

/**
 * GET /friend-messaging/streaks - Get all active messaging streaks
 */
router.get('/streaks', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await friendMessagingService.getActiveConversations(userId);
    
    // Filter for active streaks only
    const activeStreaks = conversations
      .filter(conv => conv.streak?.isActive)
      .map(conv => ({
        friend: conv.friend,
        streak: conv.streak,
        lastMessage: conv.lastMessage
      }))
      .sort((a, b) => b.streak.streakDays - a.streak.streakDays);
    
    res.json({
      success: true,
      streaks: activeStreaks,
      total: activeStreaks.length
    });
    
  } catch (error) {
    log.error('Get streaks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get messaging streaks'
    });
  }
});

export default router;