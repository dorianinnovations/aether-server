import Message from '../models/Message.js';
import analysisQueue from './analysisQueue.js';

class MessageService {
  async saveMessage(userId, content, type = 'user', aiModel = null) {
    try {
      const message = new Message({
        user: userId,
        content,
        type,
        aiModel
      });
      
      const savedMessage = await message.save();
      
      // Queue user messages for analysis
      if (type === 'user') {
        analysisQueue.addToQueue(userId, savedMessage._id, content);
      }
      
      return savedMessage;
    } catch (error) {
      console.error('Message Service Error:', error);
      throw error;
    }
  }

  async getRecentMessages(userId, limit = 10) {
    try {
      return await Message.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      console.error('Message Service Error:', error);
      throw error;
    }
  }

  async deleteUserMessages(userId) {
    try {
      return await Message.deleteMany({ user: userId });
    } catch (error) {
      console.error('Message Service Error:', error);
      throw error;
    }
  }
}

export default new MessageService();