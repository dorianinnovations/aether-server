/**
 * Matching Routes
 * API endpoints for user matching functionality
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import matchingService from '../services/matchingService.js';
import analysisQueue from '../services/analysisQueue.js';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /matching/find - Find potential matches for current user
 */
router.get('/find', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    
    const matches = await matchingService.findMatches(userId, limit);
    
    res.json({
      success: true,
      matches,
      totalFound: matches.length
    });
    
  } catch (error) {
    log.error('Match finding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to find matches'
    });
  }
});

/**
 * GET /matching/profile - Get current user's analyzed profile
 */
router.get('/profile', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      profile: user.profile || null,
      hasProfile: !!user.profile
    });
    
  } catch (error) {
    log.error('Profile retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve profile'
    });
  }
});

/**
 * GET /matching/queue-status - Get analysis queue status (for testing)
 */
router.get('/queue-status', protect, async (req, res) => {
  try {
    const status = analysisQueue.getStatus();
    
    res.json({
      success: true,
      queueStatus: status
    });
    
  } catch (error) {
    log.error('Queue status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status'
    });
  }
});

/**
 * POST /matching/force-analysis - Force process analysis queue (for testing)
 */
router.post('/force-analysis', protect, async (req, res) => {
  try {
    await analysisQueue.forceProcess();
    
    res.json({
      success: true,
      message: 'Analysis queue processed'
    });
    
  } catch (error) {
    log.error('Force analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process analysis queue',
      details: error.message
    });
  }
});

/**
 * POST /matching/test-analysis - Test profile analyzer directly (debug)
 */
router.post('/test-analysis', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const testMessage = req.body.message || "I love gaming and programming";
    
    // Import here to avoid circular dependency issues
    const profileAnalyzer = (await import('../services/profileAnalyzer.js')).default;
    
    await profileAnalyzer.analyzeMessage(userId, testMessage);
    
    // Get updated user profile
    const user = await User.findById(userId);
    
    res.json({
      success: true,
      message: 'Analysis completed',
      profile: user.profile
    });
    
  } catch (error) {
    log.error('Test analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis test failed',
      details: error.message,
      stack: error.stack
    });
  }
});

export default router;