import Conversation from '../models/Conversation.js';
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

      // Build query for Conversation model
      let query = { 
        user: userId, 
        isActive: true 
      };
      
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { summary: { $regex: search, $options: 'i' } },
          { 'messages.content': { $regex: search, $options: 'i' } }
        ];
      }

      // Get conversations using the proper Conversation model
      let conversations = await Conversation.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id title lastMessageAt messageCount summary messages')
        .lean();

      let total = await Conversation.countDocuments(query);

      // Fallback: If no conversations found, try to migrate from old Message model
      if (conversations.length === 0 && page === 1) {
        log.info(`No conversations found for user ${userId}, checking for legacy messages...`);
        
        const legacyMessages = await Message.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(100)
          .lean();

        if (legacyMessages.length > 0) {
          log.info(`Found ${legacyMessages.length} legacy messages, creating conversation...`);
          
          // Create a single conversation from legacy messages
          const newConversation = new Conversation({
            title: legacyMessages[0]?.content?.substring(0, 50) + '...' || 'Imported Conversation',
            user: userId,
            messages: legacyMessages.reverse().map(msg => ({
              _id: new mongoose.Types.ObjectId(),
              role: msg.type === 'user' ? 'user' : 'assistant',
              content: msg.content,
              timestamp: msg.createdAt,
              metadata: {
                model: msg.aiModel,
                migrated: true
              }
            })),
            messageCount: legacyMessages.length,
            lastMessageAt: legacyMessages[legacyMessages.length - 1]?.createdAt || new Date(),
            isActive: true,
            summary: legacyMessages[0]?.content?.substring(0, 100) + '...'
          });

          await newConversation.save();
          log.info(`Created conversation ${newConversation._id} with ${legacyMessages.length} migrated messages`);

          // Return the newly created conversation
          conversations = [{
            _id: newConversation._id,
            title: newConversation.title,
            lastMessageAt: newConversation.lastMessageAt,
            messageCount: newConversation.messageCount,
            summary: newConversation.summary,
            messages: newConversation.messages
          }];
          total = 1;
        }
      }

      return {
        conversations: conversations.map(conv => ({
          _id: conv._id.toString(),
          title: conv.title || 'New Conversation',
          lastActivity: conv.lastMessageAt,
          messageCount: conv.messageCount || 0,
          summary: conv.summary || (conv.messages && conv.messages.length > 0 ? 
            conv.messages[0].content?.substring(0, 100) + '...' : 
            'No messages yet')
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
      // Validate conversationId format
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return null;
      }

      // Find the conversation using the Conversation model
      const conversation = await Conversation.findOne({
        _id: conversationId,
        user: userId,
        isActive: true
      }).lean();

      if (!conversation) {
        return null;
      }

      // Limit messages if needed
      let messages = conversation.messages || [];
      if (messageLimit && messages.length > messageLimit) {
        messages = messages.slice(-messageLimit); // Get the most recent messages
      }

      return {
        _id: conversation._id.toString(),
        title: conversation.title || 'Conversation',
        messageCount: conversation.messageCount || messages.length,
        lastActivity: conversation.lastMessageAt,
        messages: messages.map(msg => ({
          _id: msg._id?.toString() || new mongoose.Types.ObjectId().toString(),
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          attachments: msg.attachments,
          metadata: msg.metadata
        }))
      };
    } catch (error) {
      log.error('Error getting conversation:', error);
      throw error;
    }
  }

  async createConversation(userId, title = 'New Conversation') {
    try {
      const conversation = new Conversation({
        title,
        user: userId,
        messages: [],
        messageCount: 0,
        lastMessageAt: new Date(),
        isActive: true
      });

      await conversation.save();

      const conversationData = {
        _id: conversation._id.toString(),
        title: conversation.title,
        userId,
        messageCount: 0,
        lastActivity: conversation.lastMessageAt,
        createdAt: conversation.createdAt
      };

      broadcastToUser(userId, 'conversation:created', conversationData);
      
      log.api(`Created new conversation for user ${userId}: ${conversation._id}`);
      return conversationData;
    } catch (error) {
      log.error('Error creating conversation:', error);
      throw error;
    }
  }

  async updateConversationTitle(userId, conversationId, title) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('Invalid conversation ID format');
      }

      const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, user: userId, isActive: true },
        { title },
        { new: true }
      );

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const conversationData = {
        _id: conversation._id.toString(),
        title: conversation.title,
        userId,
        lastActivity: conversation.lastMessageAt
      };

      broadcastToUser(userId, 'conversation:updated', conversationData);
      
      log.api(`Updated conversation title for user ${userId}: ${conversationId}`);
      return conversationData;
    } catch (error) {
      log.error('Error updating conversation title:', error);
      throw error;
    }
  }

  async addMessage(userId, conversationId, role, content, attachments = [], metadata = {}) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('Invalid conversation ID format');
      }

      const newMessage = {
        _id: new mongoose.Types.ObjectId(),
        role,
        content,
        attachments,
        metadata,
        timestamp: new Date()
      };

      // Add message to conversation and update metadata
      const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, user: userId, isActive: true },
        { 
          $push: { messages: newMessage },
          $set: { 
            lastMessageAt: newMessage.timestamp,
            summary: role === 'user' ? content.substring(0, 100) + (content.length > 100 ? '...' : '') : undefined
          },
          $inc: { messageCount: 1 }
        },
        { new: true }
      );

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const conversationData = {
        _id: conversation._id.toString(),
        messageCount: conversation.messageCount,
        lastActivity: conversation.lastMessageAt,
        lastMessage: {
          role,
          content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        }
      };

      broadcastToUser(userId, 'conversation:message_added', {
        conversationId: conversationId,
        message: {
          _id: newMessage._id.toString(),
          role,
          content,
          timestamp: newMessage.timestamp
        },
        conversation: conversationData
      });

      log.api(`Added message to conversation ${conversationId} for user ${userId}`);
      return conversationData;
    } catch (error) {
      log.error('Error adding message:', error);
      throw error;
    }
  }

  async deleteConversation(userId, conversationId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('Invalid conversation ID format');
      }

      const conversation = await Conversation.findOneAndUpdate(
        { _id: conversationId, user: userId, isActive: true },
        { isActive: false }, // Soft delete
        { new: true }
      );

      if (!conversation) {
        throw new Error('Conversation not found or already deleted');
      }

      broadcastToUser(userId, 'conversation:deleted', { 
        conversationId,
        deletedCount: conversation.messageCount 
      });

      log.api(`Deleted conversation ${conversationId} for user ${userId} (${conversation.messageCount} messages)`);
      return { deletedCount: conversation.messageCount };
    } catch (error) {
      log.error('Error deleting conversation:', error);
      throw error;
    }
  }

  async deleteAllConversations(userId) {
    try {
      const result = await Conversation.updateMany(
        { user: userId, isActive: true },
        { isActive: false } // Soft delete all conversations
      );

      broadcastToUser(userId, 'conversation:all_deleted', { 
        deletedCount: result.modifiedCount 
      });

      log.api(`Deleted all conversations for user ${userId} (${result.modifiedCount} conversations)`);
      return { deletedCount: result.modifiedCount };
    } catch (error) {
      log.error('Error deleting all conversations:', error);
      throw error;
    }
  }
}

export default new ConversationService();