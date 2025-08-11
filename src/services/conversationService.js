import Conversation from '../models/Conversation.js';
import { log } from '../utils/logger.js';
import mongoose from 'mongoose';
import llmService from './llmService.js';

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

      // Auto-generate title for first user message
      await this.autoGenerateTitleIfNeeded(
        conversationId, 
        role, 
        content, 
        conversation.messageCount
      );

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

  /**
   * Get conversation state for context preservation
   */
  async getConversationState(userId, conversationId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return null;
      }

      const conversation = await Conversation.findOne({
        _id: conversationId,
        $or: [
          { creator: userId },
          { 'participants.user': userId }
        ]
      }).select('conversationState').lean();

      return conversation?.conversationState || null;
    } catch (error) {
      log.error('Error getting conversation state:', error);
      return null;
    }
  }

  /**
   * Detect music discovery context from message
   */
  detectMusicDiscoveryContext(message) {
    const musicDiscoveryPatterns = [
      /what.*new music/i,
      /new.*music.*out/i,
      /latest.*releases/i,
      /any.*new.*releases/i,
      /new.*releases/i,
      /recent.*releases/i,
      /recommend.*music/i,
      /discover.*music/i,
      /music.*recommendations/i,
      /new.*songs/i,
      /new.*albums/i,
      /latest.*songs/i,
      /latest.*albums/i,
      /what.*should.*listen/i,
      /music.*discover/i,
      /find.*new.*artists/i,
      /music.*suggestions/i,
      /any.*music.*recommendations/i,
      /got.*any.*music/i,
      /suggest.*music/i,
      /music.*out.*now/i,
      /what.*music.*is.*good/i,
      /good.*music.*lately/i
    ];

    return musicDiscoveryPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Build context-aware prompt for music discovery
   */
  async buildMusicDiscoveryContext(userId, message) {
    try {
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId).select('artistPreferences musicProfile').lean();
      
      if (!user) return null;

      const context = {
        hasPreferences: false,
        preferenceMaturity: 'new',
        recommendationType: 'main_genres',
        userContext: ''
      };

      // Check for existing music preferences
      const followedArtists = user.artistPreferences?.followedArtists || [];
      const favoriteGenres = user.artistPreferences?.musicTaste?.favoriteGenres || [];
      const spotifyData = user.musicProfile?.spotify;
      const musicInterests = user.musicProfile?.musicPersonality?.musicInterests || [];

      // Determine preference maturity
      const totalPreferences = followedArtists.length + favoriteGenres.length + musicInterests.length;
      const spotifyConnected = spotifyData?.connected && (spotifyData.recentTracks?.length > 0 || spotifyData.topTracks?.length > 0);

      if (totalPreferences >= 5 || spotifyConnected) {
        context.hasPreferences = true;
        context.preferenceMaturity = totalPreferences >= 10 ? 'mature' : 'developing';
        context.recommendationType = 'custom_list';
      }

      // Build user context string
      const contextParts = [];
      
      if (followedArtists.length > 0) {
        const artistNames = followedArtists.slice(0, 5).map(a => a.artistName);
        contextParts.push(`Following artists: ${artistNames.join(', ')}`);
      }

      if (favoriteGenres.length > 0) {
        const genreNames = favoriteGenres.slice(0, 3).map(g => g.name);
        contextParts.push(`Favorite genres: ${genreNames.join(', ')}`);
      }

      if (spotifyData?.recentTracks?.length > 0) {
        const recentArtists = [...new Set(spotifyData.recentTracks.slice(0, 3).map(t => t.artist))];
        contextParts.push(`Recently listening to: ${recentArtists.join(', ')}`);
      }

      if (musicInterests.length > 0) {
        const interests = musicInterests.filter(i => i.confidence > 0.6).slice(0, 3).map(i => i.genre);
        if (interests.length > 0) {
          contextParts.push(`Music interests: ${interests.join(', ')}`);
        }
      }

      context.userContext = contextParts.join(' | ');

      return context;
    } catch (error) {
      log.error('Error building music discovery context:', error);
      return null;
    }
  }

  /**
   * Update conversation state
   */
  async updateConversationState(userId, conversationId, stateUpdate) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return false;
      }

      const result = await Conversation.updateOne(
        {
          _id: conversationId,
          $or: [
            { creator: userId },
            { 'participants.user': userId }
          ]
        },
        {
          $set: {
            'conversationState': {
              ...stateUpdate,
              updated_at: new Date()
            }
          }
        }
      );

      return result.modifiedCount > 0;
    } catch (error) {
      log.error('Error updating conversation state:', error);
      return false;
    }
  }

  /**
   * Merge new state with existing state
   */
  async mergeConversationState(userId, conversationId, stateUpdate) {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return false;
      }

      const existingState = await this.getConversationState(userId, conversationId);
      const mergedState = {
        user_profile: { ...existingState?.user_profile, ...stateUpdate.user_profile },
        goals: [...new Set([...(existingState?.goals || []), ...(stateUpdate.goals || [])])],
        facts: [...new Set([...(existingState?.facts || []), ...(stateUpdate.facts || [])])],
        unresolved_questions: [
          ...(existingState?.unresolved_questions || []),
          ...(stateUpdate.unresolved_questions || [])
        ],
        commitments: stateUpdate.commitments || existingState?.commitments || [],
        last_turn_summary: stateUpdate.last_turn_summary || existingState?.last_turn_summary || '',
        last_intent: stateUpdate.last_intent || existingState?.last_intent || '',
        last_sentiment: stateUpdate.last_sentiment || existingState?.last_sentiment || 'neutral',
        conversation_health_score: stateUpdate.conversation_health_score || existingState?.conversation_health_score || 50,
        updated_at: new Date()
      };

      return await this.updateConversationState(userId, conversationId, mergedState);
    } catch (error) {
      log.error('Error merging conversation state:', error);
      return false;
    }
  }

  /**
   * Generate AI-powered conversation title from first user message
   * @param {string} conversationId - The conversation ID
   * @param {string} firstMessage - The first user message
   * @returns {Object} Generated title result
   */
  async generateConversationTitle(conversationId, firstMessage) {
    try {
      if (!firstMessage || firstMessage.trim().length < 5) {
        return {
          success: false,
          error: 'Message too short for title generation'
        };
      }

      log.info(`🎯 Generating title for conversation ${conversationId.slice(-8)}`);
      
      // Generate title using LLM service (ultra cheap Llama 3.1 8B)
      const titleResult = await llmService.generateConversationTitle(firstMessage);
      
      if (titleResult.success && titleResult.title) {
        // Update the conversation title in database
        const conversation = await Conversation.findByIdAndUpdate(
          conversationId,
          { title: titleResult.title },
          { new: true }
        ).select('title');

        if (conversation) {
          log.info(`✨ Generated title: "${titleResult.title}" ${titleResult.fallback ? '(fallback)' : ''}`, {
            conversationId: conversationId.slice(-8),
            cost: titleResult.usage ? `~$${(titleResult.usage.total_tokens * 0.00000018).toFixed(6)}` : 'fallback'
          });

          return {
            success: true,
            title: titleResult.title,
            conversationId,
            fallback: titleResult.fallback || false,
            model: titleResult.model,
            usage: titleResult.usage
          };
        }
      }

      return {
        success: false,
        error: 'Failed to generate or save title'
      };
    } catch (error) {
      log.error('Error generating conversation title:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Auto-generate title for conversation when first message is added
   * Called automatically after adding the first user message
   */
  async autoGenerateTitleIfNeeded(conversationId, messageRole, messageContent, messageCount) {
    try {
      // Only generate title for first user message
      if (messageRole === 'user' && messageCount === 1) {
        // Run title generation in background (don't block the response)
        setImmediate(async () => {
          try {
            await this.generateConversationTitle(conversationId, messageContent);
          } catch (error) {
            log.error('Background title generation failed:', error);
          }
        });
        
        log.debug('Queued background title generation for new conversation');
      }
    } catch (error) {
      log.error('Error in auto title generation:', error);
      // Don't throw - this is a background operation
    }
  }
}

export default new ConversationService();