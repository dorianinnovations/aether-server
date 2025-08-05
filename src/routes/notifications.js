/**
 * Notifications Routes
 * Handles real-time notifications via Server-Sent Events
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import notificationService from '../services/notificationService.js';

const router = express.Router();

/**
 * SSE endpoint for real-time notifications
 */
router.get('/stream', protect, (req, res) => {
  const userId = req.user?.id;
  const correlationId = log.request.start('GET', '/notifications/stream', { userId });

  if (!userId) {
    log.warn('Unauthorized notification stream request', { correlationId });
    return res.status(401).json({ error: 'Authentication required' });
  }

  log.info(`🔔 Starting notification stream for user ${userId}`, { correlationId });

  // Add client to notification service
  const cleanup = notificationService.addClient(userId, res, req);

  // Handle cleanup on various events
  const handleCleanup = () => {
    cleanup();
    log.request.complete(correlationId, 200, Date.now());
  };

  res.on('close', handleCleanup);
  res.on('error', handleCleanup);
  req.on('close', handleCleanup);
});

/**
 * Get notification service stats (admin/debug endpoint)
 */
router.get('/stats', protect, (req, res) => {
  try {
    const stats = notificationService.getStats();
    const connectedUsers = notificationService.getConnectedUsers();

    res.json({
      success: true,
      stats,
      connectedUsers: connectedUsers.length,
      // Don't expose actual user IDs for privacy
      hasConnections: connectedUsers.length > 0
    });
  } catch (error) {
    log.error('Failed to get notification stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get notification stats'
    });
  }
});

/**
 * Test notification endpoint (for development/testing)
 */
router.post('/test', protect, (req, res) => {
  try {
    const userId = req.user?.id;
    const { type, message, data } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const notification = {
      type: type || 'test',
      data: {
        message: message || 'Test notification',
        timestamp: new Date().toISOString(),
        ...data
      }
    };

    const sent = notificationService.notifyUser(userId, notification);

    res.json({
      success: true,
      sent,
      notification
    });
  } catch (error) {
    log.error('Test notification failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

export default router;