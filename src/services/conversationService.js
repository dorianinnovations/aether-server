// Simple conversation service for Aether Server
import Message from '../models/Message.js';

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

  async createConversation(userId, title = 'New Conversation') {
    // For now, just return a simple response
    return {
      id: Date.now().toString(),
      title,
      userId,
      createdAt: new Date()
    };
  }

  async deleteConversation(conversationId, userId) {
    // Delete all messages for this user (simplified)
    return await Message.deleteMany({ user: userId });
  }
}

export default new ConversationService();