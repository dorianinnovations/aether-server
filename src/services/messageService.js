import Message from '../models/Message.js';
import User from '../models/User.js';
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
      
      // Increment user's total message count for user messages
      if (type === 'user') {
        // Check if user has socialProxy with personality.totalMessages, if not initialize and set to 1, otherwise increment
        const user = await User.findById(userId);
        console.log(`👤 User profile check: socialProxy exists=${!!user.socialProxy}, totalMessages exists=${!!user.socialProxy?.personality?.totalMessages}`);
        
        let updateResult;
        if (!user.socialProxy?.personality || user.socialProxy.personality.totalMessages === undefined) {
          console.log(`🔧 Initializing socialProxy.personality for user ${userId} and setting totalMessages to 1`);
          updateResult = await User.findByIdAndUpdate(userId, {
            $set: {
              'socialProxy.personality': {
                totalMessages: 1, // Set to 1 directly instead of 0 then increment
                interests: [],
                communicationStyle: {
                  casual: 0,
                  energetic: 0,
                  analytical: 0,
                  social: 0,
                  humor: 0
                },
                analysisVersion: '2.0'
              }
            }
          }, { new: true });
        } else {
          console.log(`🔢 Incrementing existing totalMessages for user ${userId}`);
          updateResult = await User.findByIdAndUpdate(userId, {
            $inc: { 'socialProxy.personality.totalMessages': 1 }
          }, { new: true });
        }
        
        console.log(`✅ Final totalMessages count for user ${userId}:`, updateResult?.socialProxy?.personality?.totalMessages || 'failed');
        
        // Queue user messages for analysis
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