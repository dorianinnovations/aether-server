import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Store active SSE connections
const connections = new Map();

// Custom auth middleware for SSE (supports query token)
const sseAuth = async (req, res, next) => {
  try {
    let token = req.headers.authorization?.replace('Bearer ', '');
    
    // For SSE, also check query parameter (EventSource can't send custom headers)
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// SSE endpoint for real-time updates
router.get('/stream', sseAuth, (req, res) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Authorization'
  });

  const userId = req.user.id;
  const connectionId = `${userId}_${Date.now()}`;

  // Store connection
  connections.set(connectionId, {
    response: res,
    userId: userId,
    lastPing: Date.now()
  });

  log.api(`SSE connection established for user ${userId}: ${connectionId}`);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    connectionId
  })}\\n\\n`);

  // Send periodic heartbeat - reduced frequency to save memory
  const heartbeat = setInterval(() => {
    try {
      // Check if connection still exists before writing
      if (!connections.has(connectionId)) {
        clearInterval(heartbeat);
        return;
      }
      
      res.write(`data: ${JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      })}\\n\\n`);
      connections.get(connectionId).lastPing = Date.now();
    } catch (error) {
      clearInterval(heartbeat);
      connections.delete(connectionId);
      log.api(`SSE heartbeat failed for ${connectionId}, connection removed`);
    }
  }, 60000); // 60 second heartbeat - reduced frequency

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    connections.delete(connectionId);
    log.api(`SSE connection closed for user ${userId}: ${connectionId}`);
  });

  req.on('error', (error) => {
    clearInterval(heartbeat);
    connections.delete(connectionId);
    log.error(`SSE connection error for ${connectionId}:`, error);
  });
});

// Broadcast event to all connected clients
export const broadcastEvent = (eventType, data, excludeUserId = null) => {
  const event = {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString()
  };

  const eventString = `data: ${JSON.stringify(event)}\\n\\n`;
  let broadcastCount = 0;
  const disconnectedConnections = [];

  for (const [connectionId, connection] of connections.entries()) {
    // Skip excluded user (e.g., the user who triggered the event)
    if (excludeUserId && connection.userId === excludeUserId) {
      continue;
    }

    try {
      connection.response.write(eventString);
      broadcastCount++;
    } catch (error) {
      // Connection is dead, mark for removal
      disconnectedConnections.push(connectionId);
      log.api(`Dead SSE connection detected: ${connectionId}`);
    }
  }

  // Clean up dead connections
  disconnectedConnections.forEach(connectionId => {
    connections.delete(connectionId);
  });

  log.api(`Broadcasted ${eventType} event to ${broadcastCount} connections`);
  return broadcastCount;
};

// Broadcast event to specific user
export const broadcastToUser = (userId, eventType, data) => {
  const event = {
    type: eventType,
    data: data,
    timestamp: new Date().toISOString()
  };

  const eventString = `data: ${JSON.stringify(event)}\\n\\n`;
  let sentCount = 0;
  const disconnectedConnections = [];

  for (const [connectionId, connection] of connections.entries()) {
    if (connection.userId === userId) {
      try {
        connection.response.write(eventString);
        sentCount++;
      } catch (error) {
        disconnectedConnections.push(connectionId);
        log.api(`Dead SSE connection detected for user ${userId}: ${connectionId}`);
      }
    }
  }

  // Clean up dead connections
  disconnectedConnections.forEach(connectionId => {
    connections.delete(connectionId);
  });

  log.api(`Sent ${eventType} event to user ${userId} (${sentCount} connections)`);
  return sentCount;
};

// Get active connections info
router.get('/status', sseAuth, (req, res) => {
  const totalConnections = connections.size;
  const uniqueUsers = new Set(Array.from(connections.values()).map(conn => conn.userId)).size;
  
  res.json({
    totalConnections,
    uniqueUsers,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Aggressive cleanup of stale connections - critical for memory management
setInterval(() => {
  const now = Date.now();
  const staleThreshold = 3 * 60 * 1000; // 3 minutes - more aggressive
  const staleConnections = [];

  for (const [connectionId, connection] of connections.entries()) {
    if (now - connection.lastPing > staleThreshold) {
      staleConnections.push(connectionId);
      // Try to close the response if still open
      try {
        if (connection.response && !connection.response.destroyed) {
          connection.response.end();
        }
      } catch (error) {
        // Ignore errors when force-closing connections
      }
    }
  }

  staleConnections.forEach(connectionId => {
    connections.delete(connectionId);
  });

  if (staleConnections.length > 0) {
    log.api(`🧹 Cleaned up ${staleConnections.length} stale SSE connections`);
  }
  
  // Log current connection count for monitoring
  if (connections.size > 10) {
    log.api(`⚠️ High SSE connection count: ${connections.size} active connections`);
  }
}, 60 * 1000); // Check every minute - more frequent cleanup

export default router;