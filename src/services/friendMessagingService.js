/**
 * Friend Messaging Service
 * Handles friend-to-friend messaging with GitHub-style heat map tracking
 * and 24-hour activity streak logic
 */

import User from '../models/User.js';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger.js';
import realTimeMessagingService from './realTimeMessaging.js';

class FriendMessagingService {
  
  /**
   * Send a message between friends
   * Updates heat map data and streak tracking
   */
  async sendMessage(fromUserId, toUsername, content) {
    try {
      // Find both users
      const fromUser = await User.findById(fromUserId);
      const toUser = await User.findOne({ username: toUsername.toLowerCase() });
      
      if (!fromUser || !toUser) {
        throw new Error('User not found');
      }
      
      // Verify friendship exists
      const friendship = fromUser.friends.find(
        f => f.user.toString() === toUser._id.toString()
      );
      const reverseFriendship = toUser.friends.find(
        f => f.user.toString() === fromUser._id.toString()
      );
      
      if (!friendship || !reverseFriendship) {
        throw new Error('Not friends with this user');
      }
      
      // Create message
      const messageId = uuidv4();
      const timestamp = new Date();
      const dateStr = timestamp.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const message = {
        from: fromUser._id,
        content: content.trim(),
        timestamp,
        messageId,
        deliveredAt: timestamp
      };
      
      // Update messaging history for both users
      await this.updateMessagingHistory(fromUser, toUser._id, message, dateStr, 'sent');
      await this.updateMessagingHistory(toUser, fromUser._id, message, dateStr, 'received');
      
      // Update streak status for both users
      await this.updateStreakStatus(fromUser, toUser._id, dateStr);
      await this.updateStreakStatus(toUser, fromUser._id, dateStr);
      
      // Save both users
      await fromUser.save();
      await toUser.save();
      
      // Send real-time notification to friend
      await realTimeMessagingService.notifyNewMessage(
        fromUser.username, 
        toUser.username, 
        message
      );
      
      log.info(`Message sent from ${fromUser.username} to ${toUser.username}`);
      
      return {
        success: true,
        messageId,
        timestamp,
        recipient: toUser.username
      };
      
    } catch (error) {
      log.error('Send message error:', error);
      throw error;
    }
  }
  
  /**
   * Update messaging history and heat map data
   */
  async updateMessagingHistory(user, friendId, message, dateStr, direction) {
    try {
      const friendship = user.friends.find(
        f => f.user.toString() === friendId.toString()
      );
      
      if (!friendship) return;
      
      // Initialize messaging history if not exists
      if (!friendship.messagingHistory) {
        friendship.messagingHistory = {
          dailyActivity: [],
          activeStreak: {
            isActive: false,
            streakDays: 0
          },
          recentMessages: [],
          stats: {
            totalConversations: 0,
            totalMessages: 0,
            longestStreak: 0
          }
        };
      }
      
      const history = friendship.messagingHistory;
      
      // Update daily activity (heat map data)
      let dailyRecord = history.dailyActivity.find(d => d.date === dateStr);
      if (!dailyRecord) {
        dailyRecord = {
          date: dateStr,
          myMessages: 0,
          theirMessages: 0,
          totalMessages: 0,
          lastActivity: new Date()
        };
        history.dailyActivity.push(dailyRecord);
        
        // Keep only last 365 days of data
        if (history.dailyActivity.length > 365) {
          history.dailyActivity = history.dailyActivity
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 365);
        }
      }
      
      // Update message counts
      if (direction === 'sent') {
        dailyRecord.myMessages++;
      } else {
        dailyRecord.theirMessages++;
      }
      dailyRecord.totalMessages++;
      dailyRecord.lastActivity = new Date();
      
      // Add to recent messages (keep last 50)
      history.recentMessages.unshift(message);
      if (history.recentMessages.length > 50) {
        history.recentMessages = history.recentMessages.slice(0, 50);
      }
      
      // Update stats
      history.stats.totalMessages++;
      history.stats.lastConversation = new Date();
      if (!history.stats.firstConversation) {
        history.stats.firstConversation = new Date();
      }
      
    } catch (error) {
      log.error('Update messaging history error:', error);
      throw error;
    }
  }
  
  /**
   * Update streak status based on 24-hour activity rule
   * Both parties must be active within 24 hours to maintain streak
   */
  async updateStreakStatus(user, friendId, dateStr) {
    try {
      const friendship = user.friends.find(
        f => f.user.toString() === friendId.toString()
      );
      
      if (!friendship?.messagingHistory) return;
      
      const history = friendship.messagingHistory;
      const today = new Date(dateStr);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // Find today's and yesterday's activity
      const todayActivity = history.dailyActivity.find(d => d.date === dateStr);
      const yesterdayActivity = history.dailyActivity.find(d => d.date === yesterdayStr);
      
      // Check if both parties have been active today
      const bothActiveToday = todayActivity && 
        todayActivity.myMessages > 0 && 
        todayActivity.theirMessages > 0;
      
      // Check if both parties were active yesterday
      const bothActiveYesterday = yesterdayActivity && 
        yesterdayActivity.myMessages > 0 && 
        yesterdayActivity.theirMessages > 0;
      
      if (bothActiveToday) {
        if (!history.activeStreak.isActive) {
          // Start new streak
          history.activeStreak = {
            isActive: true,
            startDate: today,
            lastBothActiveDate: today,
            streakDays: 1
          };
        } else if (bothActiveYesterday) {
          // Continue streak
          history.activeStreak.streakDays++;
          history.activeStreak.lastBothActiveDate = today;
        } else {
          // Check if streak should continue (gap of 1 day allowed)
          const daysSinceLastActive = Math.floor(
            (today - new Date(history.activeStreak.lastBothActiveDate)) / (1000 * 60 * 60 * 24)
          );
          
          if (daysSinceLastActive <= 1) {
            // Continue streak
            history.activeStreak.streakDays++;
            history.activeStreak.lastBothActiveDate = today;
          } else {
            // Reset streak
            history.activeStreak = {
              isActive: true,
              startDate: today,
              lastBothActiveDate: today,
              streakDays: 1
            };
          }
        }
        
        // Update longest streak record
        if (history.activeStreak.streakDays > history.stats.longestStreak) {
          history.stats.longestStreak = history.activeStreak.streakDays;
        }
      } else {
        // Check if streak should expire (more than 24 hours since last both active)
        if (history.activeStreak.isActive && history.activeStreak.lastBothActiveDate) {
          const hoursSinceLastBothActive = 
            (new Date() - new Date(history.activeStreak.lastBothActiveDate)) / (1000 * 60 * 60);
          
          if (hoursSinceLastBothActive > 24) {
            history.activeStreak.isActive = false;
          }
        }
      }
      
    } catch (error) {
      log.error('Update streak status error:', error);
      throw error;
    }
  }
  
  /**
   * Get conversation history between friends
   */
  async getConversationHistory(userId, friendUsername, limit = 50) {
    try {
      const user = await User.findById(userId);
      const friend = await User.findOne({ username: friendUsername.toLowerCase() });
      
      if (!user || !friend) {
        throw new Error('User not found');
      }
      
      const friendship = user.friends.find(
        f => f.user.toString() === friend._id.toString()
      );
      
      if (!friendship) {
        throw new Error('Not friends with this user');
      }
      
      const history = friendship.messagingHistory;
      if (!history) {
        return {
          messages: [],
          streak: { isActive: false, streakDays: 0 },
          stats: { totalMessages: 0 }
        };
      }
      
      // Get recent messages with user details
      const messages = history.recentMessages
        .slice(0, limit)
        .map(msg => ({
          messageId: msg.messageId,
          content: msg.content,
          timestamp: msg.timestamp,
          fromMe: msg.from.toString() === userId,
          from: msg.from.toString() === userId ? user.username : friend.username,
          readAt: msg.readAt,
          deliveredAt: msg.deliveredAt,
          status: this.getMessageStatus(msg, userId)
        }));
      
      return {
        messages,
        streak: history.activeStreak,
        stats: history.stats,
        heatMapData: this.generateHeatMapData(history.dailyActivity)
      };
      
    } catch (error) {
      log.error('Get conversation history error:', error);
      throw error;
    }
  }
  
  /**
   * Generate heat map data for frontend visualization
   */
  generateHeatMapData(dailyActivity) {
    const heatMap = [];
    const today = new Date();
    
    // Generate last 365 days
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const activity = dailyActivity.find(d => d.date === dateStr);
      
      heatMap.push({
        date: dateStr,
        count: activity ? activity.totalMessages : 0,
        level: this.getActivityLevel(activity ? activity.totalMessages : 0)
      });
    }
    
    return heatMap;
  }
  
  /**
   * Get activity level for heat map visualization (0-4 scale like GitHub)
   */
  getActivityLevel(messageCount) {
    if (messageCount === 0) return 0;
    if (messageCount <= 2) return 1;
    if (messageCount <= 5) return 2;
    if (messageCount <= 10) return 3;
    return 4;
  }
  
  /**
   * Get message status for display purposes
   */
  getMessageStatus(message, currentUserId) {
    // Only show status for messages sent by current user
    if (message.from.toString() !== currentUserId) {
      return null;
    }
    
    if (message.readAt) {
      return 'read';
    } else if (message.deliveredAt) {
      return 'delivered';
    } else {
      return 'sent';
    }
  }
  
  /**
   * Mark messages as read in a conversation
   */
  async markMessagesAsRead(userId, friendUsername, messageIds = []) {
    try {
      const user = await User.findById(userId);
      const friend = await User.findOne({ username: friendUsername.toLowerCase() });
      
      if (!user || !friend) {
        throw new Error('User not found');
      }
      
      const friendship = user.friends.find(
        f => f.user.toString() === friend._id.toString()
      );
      
      if (!friendship?.messagingHistory) {
        return { markedAsRead: 0 };
      }
      
      let markedAsRead = 0;
      const now = new Date();
      
      // Mark specific messages or all unread messages from friend
      friendship.messagingHistory.recentMessages.forEach(message => {
        const shouldMarkAsRead = messageIds.length > 0 
          ? messageIds.includes(message.messageId)
          : message.from.toString() === friend._id.toString();
          
        if (shouldMarkAsRead && !message.readAt && message.from.toString() !== userId) {
          message.readAt = now;
          markedAsRead++;
        }
      });
      
      if (markedAsRead > 0) {
        await user.save();
        
        // Send read receipts via Socket.IO
        messageIds.forEach(messageId => {
          realTimeMessagingService.io?.to(
            realTimeMessagingService.userSockets.get(friend._id.toString())
          )?.emit('message:read_receipt', {
            messageId,
            readAt: now,
            readBy: user.username
          });
        });
      }
      
      return { markedAsRead };
      
    } catch (error) {
      log.error('Mark messages as read error:', error);
      throw error;
    }
  }

  /**
   * Get active conversations (friends with recent activity)
   */
  async getActiveConversations(userId) {
    try {
      const user = await User.findById(userId)
        .populate('friends.user', 'username name');
      
      if (!user) {
        throw new Error('User not found');
      }
      
      const activeConversations = [];
      
      for (const friendship of user.friends) {
        const history = friendship.messagingHistory;
        
        if (history && history.recentMessages.length > 0) {
          const lastMessage = history.recentMessages[0];
          const hoursSinceLastMessage = 
            (new Date() - new Date(lastMessage.timestamp)) / (1000 * 60 * 60);
          
          // Include conversations with activity in last 7 days
          if (hoursSinceLastMessage <= 168) { // 7 days
            activeConversations.push({
              friend: {
                username: friendship.user.username,
                name: friendship.user.name
              },
              lastMessage: {
                content: lastMessage.content.substring(0, 100),
                timestamp: lastMessage.timestamp,
                fromMe: lastMessage.from.toString() === userId
              },
              streak: history.activeStreak,
              unreadCount: 0 // Could be enhanced later
            });
          }
        }
      }
      
      // Sort by most recent activity
      activeConversations.sort((a, b) => 
        new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp)
      );
      
      return activeConversations;
      
    } catch (error) {
      log.error('Get active conversations error:', error);
      throw error;
    }
  }
}

export default new FriendMessagingService();