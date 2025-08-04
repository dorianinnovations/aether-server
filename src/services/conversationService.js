import Message from '../models/Message.js';
import { broadcastToUser } from '../routes/events.js';
import { log } from '../utils/logger.js';
import mongoose from 'mongoose';

class ConversationService {
  async getConversationHistory(userId, limit = 10) {
    try {
      return await Message.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'email')
        .lean();
    } catch (error) {
      console.error('Conversation Service Error:', error);
      throw error;
    }
  }

  async getUserConversations(userId, options = {}) {
    try {
      const { page = 1, limit = 20, search } = options;
      const skip = (page - 1) * limit;

      let query = { user: userId };
      if (search) {
        query.$or = [
          { content: { $regex: search, $options: 'i' } },
        ];
      }

      const conversations = await Message.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            title: { $first: "$content" },
            lastActivity: { $max: "$createdAt" },
            messageCount: { $sum: 1 },
            summary: { $first: "$content" }
          }
        },
        { $sort: { lastActivity: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      const total = await Message.countDocuments(query);

      return {
        conversations: conversations.map(conv => ({
          _id: conv._id,
          title: conv.title?.substring(0, 50) + '...' || 'New Conversation',
          lastActivity: conv.lastActivity,
          messageCount: conv.messageCount,
          summary: conv.summary?.substring(0, 100) + '...'
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      log.error('Error getting user conversations:', error);
      throw error;
    }
  }

  async getConversation(userId, conversationId, messageLimit = 500) {
    try {
      const messages = await Message.find({ 
        user: userId,
        conversationId: conversationId 
      })
        .sort({ createdAt: -1 })
        .limit(messageLimit)
        .populate('user', 'email username')
        .lean();

      if (messages.length === 0) {
        return null;
      }

      return {
        _id: conversationId,
        title: messages[0]?.content?.substring(0, 50) + '...' || 'Conversation',
        messageCount: messages.length,
        lastActivity: messages[0]?.createdAt,
        messages: messages.reverse()
      };
    } catch (error) {
      log.error('Error getting conversation:', error);
      throw error;
    }
  }

  async createConversation(userId, title = 'New Conversation') {
    try {
      const conversation = {
        _id: new mongoose.Types.ObjectId().toString(),
        title,
        userId,
        messageCount: 0,
        lastActivity: new Date(),
        createdAt: new Date()
      };

      broadcastToUser(userId, 'conversation:created', conversation);
      
      log.api(`Created new conversation for user ${userId}: ${conversation._id}`);
      return conversation;
    } catch (error) {
      log.error('Error creating conversation:', error);
      throw error;
    }
  }

  async updateConversationTitle(userId, conversationId, title) {
    try {
      const messages = await Message.find({ 
        user: userId,
        conversationId: conversationId 
      }).limit(1);

      if (messages.length === 0) {
        throw new Error('Conversation not found');
      }

      const conversation = {
        _id: conversationId,
        title,
        userId,
        lastActivity: new Date()
      };

      broadcastToUser(userId, 'conversation:updated', conversation);
      
      log.api(`Updated conversation title for user ${userId}: ${conversationId}`);
      return conversation;
    } catch (error) {
      log.error('Error updating conversation title:', error);
      throw error;
    }
  }

  async addMessage(userId, conversationId, role, content, attachments = [], metadata = {}) {
    try {
      const message = new Message({
        user: userId,
        conversationId,
        role,
        content,
        attachments,
        metadata,
        createdAt: new Date()
      });

      await message.save();

      const conversation = {
        _id: conversationId,
        messageCount: await Message.countDocuments({ 
          user: userId, 
          conversationId 
        }),
        lastActivity: new Date(),
        lastMessage: {
          role,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        }
      };

      broadcastToUser(userId, 'conversation:message_added', {
        conversationId,
        message: {
          _id: message._id,
          role,
          content,
          createdAt: message.createdAt
        },
        conversation
      });

      log.api(`Added message to conversation ${conversationId} for user ${userId}`);
      return conversation;
    } catch (error) {
      log.error('Error adding message:', error);
      throw error;
    }
  }

  async deleteConversation(userId, conversationId) {
    try {
      // Accept both date-based IDs (YYYY-MM-DD) and ObjectId formats
      const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(conversationId);
      const isObjectId = mongoose.Types.ObjectId.isValid(conversationId);
      
      if (!isDateFormat && !isObjectId) {
        throw new Error('Invalid conversation ID format');
      }

      const result = await Message.deleteMany({ 
        user: userId,
        conversationId: conversationId 
      });

      if (result.deletedCount === 0) {
        throw new Error('Conversation not found or already deleted');
      }

      broadcastToUser(userId, 'conversation:deleted', { 
        conversationId,
        deletedCount: result.deletedCount 
      });

      log.api(`Deleted conversation ${conversationId} for user ${userId} (${result.deletedCount} messages)`);
      return result;
    } catch (error) {
      log.error('Error deleting conversation:', error);
      throw error;
    }
  }

  async deleteAllConversations(userId) {
    try {
      const result = await Message.deleteMany({ user: userId });

      broadcastToUser(userId, 'conversation:all_deleted', { 
        deletedCount: result.deletedCount 
      });

      log.api(`Deleted all conversations for user ${userId} (${result.deletedCount} messages)`);
      return result;
    } catch (error) {
      log.error('Error deleting all conversations:', error);
      throw error;
    }
  }
}

export default new ConversationService();