import Conversation from '../models/Conversation.js';
import { log } from '../utils/logger.js';
import mongoose from 'mongoose';

class ConversationService {
  async getConversationHistory(userId, limit = 10) {
    try {
      // Get recent messages from all conversations where user is participant
      const conversations = await Conversation.find({
        $or: [
          { creator: userId },
          { 'participants.user': userId }
        ],
        isActive: true
      })
      .sort({ lastMessageAt: -1 })
      .limit(5) // Get recent conversations
      .select('messages')
      .lean();

      const allMessages = [];
      conversations.forEach(conv => {
        allMessages.push(...conv.messages.slice(-limit));
      });

      return allMessages
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    } catch (error) {
      console.error('Conversation Service Error:', error);
      throw error;
    }
  }

  async getUserConversations(userId, options = {}) {
    try {
      const { page = 1, limit = 20, search, type } = options;
      const skip = (page - 1) * limit;

      // Build query for updated Conversation model - user can be creator or participant
      let query = { 
        $or: [
          { creator: userId },
          { 'participants.user': userId }
        ],
        isActive: true 
      };
      
      // Filter by conversation type if specified
      if (type) {
        query.type = type;
      }
      
      if (search) {
        query.$and = [
          query,
          {
            $or: [
              { title: { $regex: search, $options: 'i' } },
              { summary: { $regex: search, $options: 'i' } },
              { 'messages.content': { $regex: search, $options: 'i' } }
            ]
          }
        ];
      }

      // Get conversations using the updated Conversation model
      let conversations = await Conversation.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id title type lastMessageAt messageCount summary messages participants creator')
        .populate('participants.user', 'username')
        .populate('creator', 'username')
        .lean();

      let total = await Conversation.countDocuments(query);

      // Legacy migration removed - all conversations use unified model

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

      // Optimized query with message slice and selective projection
      let query = Conversation.findOne({
        _id: conversationId,
        $or: [
          { creator: userId },
          { 'participants.user': userId }
        ],
        isActive: true
      }).lean();

      // Add message limit projection if specified
      if (messageLimit && messageLimit > 0) {
        query = query.select({
          title: 1,
          creator: 1,
          isActive: 1,
          participants: 1,
          messages: { $slice: -messageLimit }
        });
      }

      const conversation = await query;

      if (!conversation) {
        return null;
      }

      // Messages already limited at database level via $slice projection
      let messages = conversation.messages || [];

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

  async createConversation(userId, title = 'New Conversation', type = 'aether', participantIds = []) {
    try {
      // Prepare participants array
      const participants = [];
      
      // For aether conversations, only add the creator as participant
      if (type === 'aether') {
        participants.push({ user: userId, role: 'member' });
      } else {
        // For direct/group conversations, add all participants
        participants.push({ user: userId, role: 'admin' }); // Creator is admin
        participantIds.forEach(id => {
          participants.push({ user: id, role: 'member' });
        });
      }

      const conversation = new Conversation({
        title,
        type,
        creator: userId,
        participants,
        messages: [],
        messageCount: 0,
        lastMessageAt: new Date(),
        isActive: true
      });

      await conversation.save();

      const conversationData = {
        _id: conversation._id.toString(),
        title: conversation.title,
        type: conversation.type,
        creator: userId,
        participants: conversation.participants,
        messageCount: 0,
        lastActivity: conversation.lastMessageAt,
        createdAt: conversation.createdAt
      };

      // Remove event broadcasting since we removed events
      log.info(`Created new ${type} conversation`, { conversationId: conversation._id.toString().slice(-8) });
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
        { 
          _id: conversationId, 
          $or: [
            { creator: userId },
            { 'participants.user': userId }
          ], 
          isActive: true 
        },
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

      // Event broadcasting removed
      
      log.debug('Updated conversation title');
      return conversationData;
    } catch (error) {
      log.error('Error updating conversation title:', error);
      throw error;
    }
  }

  async addMessage(userId, conversationId, role, content, attachments = [], metadata = {}, authorId = null) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new Error('Invalid conversation ID format');
      }

      const newMessage = {
        _id: new mongoose.Types.ObjectId(),
        role,
        content,
        author: authorId || userId, // Track who authored the message
        attachments,
        metadata,
        timestamp: new Date()
      };

      // Find conversation where user is creator or participant
      const conversation = await Conversation.findOneAndUpdate(
        { 
          _id: conversationId, 
          $or: [
            { creator: userId },
            { 'participants.user': userId }
          ],
          isActive: true 
        },
        { 
          $push: { messages: newMessage },
          $set: { 
            lastMessageAt: newMessage.timestamp
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

      // Event broadcasting removed

      log.debug('Added message to conversation');
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
        { 
          _id: conversationId, 
          $or: [
            { creator: userId },
            { 'participants.user': userId }
          ], 
          isActive: true 
        },
        { isActive: false }, // Soft delete
        { new: true }
      );

      if (!conversation) {
        throw new Error('Conversation not found or already deleted');
      }

      // Event broadcasting removed

      log.info('Deleted conversation', { messageCount: conversation.messageCount });
      return { deletedCount: conversation.messageCount };
    } catch (error) {
      log.error('Error deleting conversation:', error);
      throw error;
    }
  }

  async deleteAllConversations(userId) {
    try {
      const result = await Conversation.updateMany(
        { 
          $or: [
            { creator: userId },
            { 'participants.user': userId }
          ],
          isActive: true 
        },
        { isActive: false } // Soft delete all conversations
      );

      // Event broadcasting removed

      log.info('Deleted all conversations', { count: result.modifiedCount });
      return { deletedCount: result.modifiedCount };
    } catch (error) {
      log.error('Error deleting all conversations:', error);
      throw error;
    }
  }
}

export default new ConversationService();