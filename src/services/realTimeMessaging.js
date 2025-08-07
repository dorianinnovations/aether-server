/**
 * Real-Time Messaging Service
 * Handles Socket.IO connections for typing indicators, read receipts, and live messaging
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

class RealTimeMessagingService {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> socketId
    this.socketUsers = new Map(); // socketId -> userId
    this.typingUsers = new Map(); // conversationKey -> Set of userIds
    this.typingTimeouts = new Map(); // userId:friendId -> timeout
  }

  initialize(io) {
    this.io = io;
    
    // Socket.IO middleware for authentication
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('No token provided'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user._id.toString();
        socket.username = user.username;
        next();
        
      } catch (error) {
        log.error('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    log.system('Real-time messaging service initialized');
  }

  handleConnection(socket) {
    const userId = socket.userId;
    const username = socket.username;
    
    // Track user's socket
    this.userSockets.set(userId, socket.id);
    this.socketUsers.set(socket.id, userId);
    
    log.debug(`User ${username} connected via Socket.IO`);

    // Join user to their personal room for notifications
    socket.join(`user:${userId}`);

    // Handle typing indicators
    socket.on('typing:start', (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on('typing:stop', (data) => {
      this.handleTypingStop(socket, data);
    });

    // Handle read receipts
    socket.on('message:read', (data) => {
      this.handleMessageRead(socket, data);
    });

    // Handle joining conversation rooms
    socket.on('conversation:join', (data) => {
      this.handleConversationJoin(socket, data);
    });

    socket.on('conversation:leave', (data) => {
      this.handleConversationLeave(socket, data);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  handleTypingStart(socket, data) {
    const { friendUsername } = data;
    const userId = socket.userId;
    
    try {
      // Create conversation key (consistent ordering)
      const conversationKey = this.getConversationKey(socket.username, friendUsername);
      
      // Add user to typing set for this conversation
      if (!this.typingUsers.has(conversationKey)) {
        this.typingUsers.set(conversationKey, new Set());
      }
      this.typingUsers.get(conversationKey).add(userId);
      
      // Clear existing timeout
      const timeoutKey = `${userId}:${friendUsername}`;
      if (this.typingTimeouts.has(timeoutKey)) {
        clearTimeout(this.typingTimeouts.get(timeoutKey));
      }
      
      // Set auto-stop timeout (10 seconds)
      const timeout = setTimeout(() => {
        this.handleTypingStop(socket, data);
      }, 10000);
      this.typingTimeouts.set(timeoutKey, timeout);
      
      // Notify friend that user is typing
      this.io.to(`conversation:${conversationKey}`).emit('typing:update', {
        conversationKey,
        username: socket.username,
        isTyping: true
      });
      
      log.debug(`${socket.username} started typing to ${friendUsername}`);
      
    } catch (error) {
      log.error('Typing start error:', error);
    }
  }

  handleTypingStop(socket, data) {
    const { friendUsername } = data;
    const userId = socket.userId;
    
    try {
      const conversationKey = this.getConversationKey(socket.username, friendUsername);
      
      // Remove user from typing set
      if (this.typingUsers.has(conversationKey)) {
        this.typingUsers.get(conversationKey).delete(userId);
        
        // Clean up empty sets
        if (this.typingUsers.get(conversationKey).size === 0) {
          this.typingUsers.delete(conversationKey);
        }
      }
      
      // Clear timeout
      const timeoutKey = `${userId}:${friendUsername}`;
      if (this.typingTimeouts.has(timeoutKey)) {
        clearTimeout(this.typingTimeouts.get(timeoutKey));
        this.typingTimeouts.delete(timeoutKey);
      }
      
      // Notify friend that user stopped typing
      this.io.to(`conversation:${conversationKey}`).emit('typing:update', {
        conversationKey,
        username: socket.username,
        isTyping: false
      });
      
      log.debug(`${socket.username} stopped typing to ${friendUsername}`);
      
    } catch (error) {
      log.error('Typing stop error:', error);
    }
  }

  async handleMessageRead(socket, data) {
    const { messageId, friendUsername } = data;
    const userId = socket.userId;
    
    try {
      // Update read receipt in database
      const user = await User.findById(userId);
      if (!user) return;
      
      const friend = await User.findOne({ username: friendUsername.toLowerCase() });
      if (!friend) return;
      
      // Find friendship and update read receipt
      const friendship = user.friends.find(
        f => f.user.toString() === friend._id.toString()
      );
      
      if (!friendship?.messagingHistory) return;
      
      const message = friendship.messagingHistory.recentMessages.find(
        m => m.messageId === messageId
      );
      
      if (message && !message.readAt && message.from.toString() !== userId) {
        message.readAt = new Date();
        await user.save();
        
        // Notify sender of read receipt
        const friendSocketId = this.userSockets.get(friend._id.toString());
        if (friendSocketId) {
          this.io.to(friendSocketId).emit('message:read_receipt', {
            messageId,
            readAt: message.readAt,
            readBy: socket.username
          });
        }
        
        log.debug(`Message ${messageId} marked as read by ${socket.username}`);
      }
      
    } catch (error) {
      log.error('Message read error:', error);
    }
  }

  handleConversationJoin(socket, data) {
    const { friendUsername } = data;
    const conversationKey = this.getConversationKey(socket.username, friendUsername);
    
    socket.join(`conversation:${conversationKey}`);
    log.debug(`${socket.username} joined conversation with ${friendUsername}`);
  }

  handleConversationLeave(socket, data) {
    const { friendUsername } = data;
    const conversationKey = this.getConversationKey(socket.username, friendUsername);
    
    socket.leave(`conversation:${conversationKey}`);
    
    // Stop typing when leaving conversation
    this.handleTypingStop(socket, data);
    
    log.debug(`${socket.username} left conversation with ${friendUsername}`);
  }

  handleDisconnect(socket) {
    const userId = socket.userId;
    const username = socket.username;
    
    // Clean up tracking
    this.userSockets.delete(userId);
    this.socketUsers.delete(socket.id);
    
    // Clean up typing indicators
    for (const [conversationKey, typingSet] of this.typingUsers.entries()) {
      if (typingSet.has(userId)) {
        typingSet.delete(userId);
        
        // Notify others that user stopped typing
        this.io.to(`conversation:${conversationKey}`).emit('typing:update', {
          conversationKey,
          username,
          isTyping: false
        });
        
        if (typingSet.size === 0) {
          this.typingUsers.delete(conversationKey);
        }
      }
    }
    
    // Clear timeouts
    for (const [key, timeout] of this.typingTimeouts.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timeout);
        this.typingTimeouts.delete(key);
      }
    }
    
    log.debug(`User ${username} disconnected from Socket.IO`);
  }

  // Utility: Create consistent conversation key for room names
  getConversationKey(username1, username2) {
    return [username1, username2].sort().join(':');
  }

  // Send new message notification to friend
  async notifyNewMessage(fromUsername, toUsername, message) {
    try {
      const toUser = await User.findOne({ username: toUsername.toLowerCase() });
      if (!toUser) return;
      
      const socketId = this.userSockets.get(toUser._id.toString());
      if (socketId) {
        this.io.to(socketId).emit('message:new', {
          from: fromUsername,
          message: {
            messageId: message.messageId,
            content: message.content,
            timestamp: message.timestamp,
            fromMe: false
          }
        });
        
        log.debug(`New message notification sent to ${toUsername} from ${fromUsername}`);
      }
      
    } catch (error) {
      log.error('New message notification error:', error);
    }
  }

  // Check if user is online
  isUserOnline(userId) {
    return this.userSockets.has(userId);
  }

  // Get online status for multiple users
  getOnlineStatus(userIds) {
    const status = {};
    userIds.forEach(userId => {
      status[userId] = this.userSockets.has(userId);
    });
    return status;
  }
}

const realTimeMessagingService = new RealTimeMessagingService();

export const initializeRealTimeMessaging = (io) => {
  realTimeMessagingService.initialize(io);
};

export default realTimeMessagingService;