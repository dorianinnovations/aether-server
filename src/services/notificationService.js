/**
 * Notification Service
 * Handles real-time notifications via Server-Sent Events (SSE)
 */

import EventEmitter from 'events';
import { log } from '../utils/logger.js';

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // userId -> Set of response objects
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      totalNotificationsSent: 0
    };

    log.info('Notification Service initialized');
  }

  /**
   * Add a client connection for real-time notifications
   * @param {string} userId - User ID
   * @param {Object} res - Express response object for SSE
   * @param {Object} req - Express request object
   */
  addClient(userId, res, req) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }

    const clientSet = this.clients.get(userId);
    clientSet.add(res);

    this.stats.totalConnections++;
    this.stats.activeConnections++;

    log.debug(`📱 Client connected for notifications: ${userId}`, {
      activeConnections: this.stats.activeConnections,
      userAgent: req.headers['user-agent']?.substring(0, 50)
    });

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    });

    // Send initial connection event
    this.sendToClient(res, {
      type: 'connection',
      data: {
        status: 'connected',
        timestamp: new Date().toISOString()
      }
    });

    // Setup cleanup on disconnect
    const cleanup = () => {
      clientSet.delete(res);
      this.stats.activeConnections--;
      
      if (clientSet.size === 0) {
        this.clients.delete(userId);
      }

      log.debug(`📱 Client disconnected: ${userId}`, {
        activeConnections: this.stats.activeConnections
      });
    };

    res.on('close', cleanup);
    res.on('error', cleanup);
    req.on('close', cleanup);

    // Keep connection alive with periodic heartbeat
    const heartbeatInterval = setInterval(() => {
      if (res.destroyed || res.headersSent === false) {
        clearInterval(heartbeatInterval);
        cleanup();
        return;
      }

      this.sendToClient(res, {
        type: 'heartbeat',
        data: { timestamp: new Date().toISOString() }
      });
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(heartbeatInterval);
      cleanup();
    };
  }

  /**
   * Send notification to specific user
   * @param {string} userId - User ID
   * @param {Object} notification - Notification data
   */
  notifyUser(userId, notification) {
    const clientSet = this.clients.get(userId);
    
    if (!clientSet || clientSet.size === 0) {
      log.debug(`📪 No active connections for user ${userId}`);
      return false;
    }

    let sentCount = 0;
    const deadConnections = [];

    for (const res of clientSet) {
      try {
        if (res.destroyed) {
          deadConnections.push(res);
          continue;
        }

        this.sendToClient(res, notification);
        sentCount++;
      } catch (error) {
        log.warn(`Failed to send notification to user ${userId}:`, error.message);
        deadConnections.push(res);
      }
    }

    // Clean up dead connections
    deadConnections.forEach(res => clientSet.delete(res));
    if (clientSet.size === 0) {
      this.clients.delete(userId);
    }

    this.stats.totalNotificationsSent += sentCount;

    log.debug(`🔔 Notification sent to ${sentCount} clients for user ${userId}`, {
      type: notification.type,
      totalSent: this.stats.totalNotificationsSent
    });

    return sentCount > 0;
  }

  /**
   * Send raw data to client via SSE
   * @param {Object} res - Response object
   * @param {Object} data - Data to send
   */
  sendToClient(res, data) {
    if (res.destroyed) return;

    const sseData = `data: ${JSON.stringify(data)}\n\n`;
    res.write(sseData);
  }

  /**
   * Send profile update notification
   * @param {string} userId - User ID
   * @param {Object} updateData - Profile update data
   */
  notifyProfileUpdate(userId, updateData) {
    return this.notifyUser(userId, {
      type: 'profile_update',
      data: {
        message: 'Your profile was updated based on recent conversations',
        updates: updateData,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send Spotify status update notification
   * @param {string} userId - User ID
   * @param {Object} spotifyData - Spotify update data
   */
  notifySpotifyUpdate(userId, spotifyData) {
    return this.notifyUser(userId, {
      type: 'spotify_update',
      data: {
        message: 'Your music status was updated',
        spotify: spotifyData,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Send friend activity notification
   * @param {string} userId - User ID
   * @param {Object} activityData - Friend activity data
   */
  notifyFriendActivity(userId, activityData) {
    return this.notifyUser(userId, {
      type: 'friend_activity',
      data: {
        message: `${activityData.friendName} updated their status`,
        activity: activityData,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeUsers: this.clients.size,
      totalActiveConnections: Array.from(this.clients.values())
        .reduce((sum, clientSet) => sum + clientSet.size, 0)
    };
  }

  /**
   * Get connected users
   */
  getConnectedUsers() {
    return Array.from(this.clients.keys());
  }

  /**
   * Disconnect all clients for a user
   * @param {string} userId - User ID
   */
  disconnectUser(userId) {
    const clientSet = this.clients.get(userId);
    if (!clientSet) return 0;

    let disconnectedCount = 0;
    for (const res of clientSet) {
      try {
        res.end();
        disconnectedCount++;
      } catch (error) {
        // Connection already closed
      }
    }

    this.clients.delete(userId);
    this.stats.activeConnections -= disconnectedCount;

    log.info(`Disconnected ${disconnectedCount} connections for user ${userId}`);
    return disconnectedCount;
  }

  /**
   * Broadcast to all connected users
   * @param {Object} notification - Notification to broadcast
   */
  broadcast(notification) {
    let totalSent = 0;
    
    for (const userId of this.clients.keys()) {
      if (this.notifyUser(userId, notification)) {
        totalSent++;
      }
    }

    log.info(`Broadcast sent to ${totalSent} users`, { type: notification.type });
    return totalSent;
  }
}

export default new NotificationService();