/**
 * Memory Management Routes
 * API endpoints for RAG memory system
 */

import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import ragMemoryService from '../services/ragMemoryService.js';
import conversationService from '../services/conversationService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Store a memory
router.post('/store', protect, [
  body('content').notEmpty().trim().isLength({ min: 10, max: 2000 })
    .withMessage('Content must be between 10-2000 characters'),
  body('type').optional().isIn(['profile','preference','project','fact','task','contact','custom'])
    .withMessage('Invalid memory type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { content, type = 'fact', metadata = {} } = req.body;
    const userId = req.user.id;

    const success = await ragMemoryService.storeMemory(userId, content, {
      ...metadata,
      type,
      source: 'manual'
    });

    if (success) {
      log.info(`Stored memory for user ${userId}: ${content.substring(0, 50)}...`);
      res.json({
        status: 'success',
        message: 'Memory stored successfully'
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: 'Failed to store memory'
      });
    }
  } catch (error) {
    log.error('Error storing memory:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// Search memories
router.post('/search', protect, [
  body('query').notEmpty().trim().isLength({ min: 3, max: 500 })
    .withMessage('Query must be between 3-500 characters'),
  body('limit').optional().isInt({ min: 1, max: 20 })
    .withMessage('Limit must be between 1-20')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { query, limit = 5, minSimilarity = 0.6 } = req.body;
    const userId = req.user.id;

    const memories = await ragMemoryService.searchMemories(
      userId, 
      query, 
      parseInt(limit), 
      parseFloat(minSimilarity)
    );

    log.info(`Memory search for user ${userId}: "${query}" - ${memories.length} results`);
    
    res.json({
      status: 'success',
      data: {
        query,
        results: memories,
        count: memories.length
      }
    });
  } catch (error) {
    log.error('Error searching memories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Memory search failed'
    });
  }
});

// Get memory stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await ragMemoryService.getMemoryStats(userId);

    res.json({
      status: 'success',
      data: stats
    });
  } catch (error) {
    log.error('Error getting memory stats:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to get memory stats'
    });
  }
});

// Clear all memories (for privacy/testing)
router.delete('/clear', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const clearedCount = await ragMemoryService.clearUserMemories(userId);

    log.info(`Cleared ${clearedCount} memories for user ${userId}`);
    
    res.json({
      status: 'success',
      message: `Cleared ${clearedCount} memories`,
      data: { clearedCount }
    });
  } catch (error) {
    log.error('Error clearing memories:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to clear memories'
    });
  }
});

// Auto-store conversation memories
router.post('/auto-store/:conversationId', protect, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    // Get conversation messages
    const conversation = await conversationService.getConversation(userId, conversationId);
    if (!conversation) {
      return res.status(404).json({
        status: 'error',
        message: 'Conversation not found'
      });
    }

    const storedCount = await ragMemoryService.autoStoreConversation(
      userId, 
      conversation.messages, 
      conversationId
    );

    log.info(`Auto-stored ${storedCount} memories from conversation ${conversationId} for user ${userId}`);
    
    res.json({
      status: 'success',
      message: `Stored ${storedCount} conversation memories`,
      data: { storedCount }
    });
  } catch (error) {
    log.error('Error auto-storing conversation:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to auto-store conversation'
    });
  }
});

export default router;