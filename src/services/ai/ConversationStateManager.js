import conversationService from '../conversationService.js';

class ConversationStateManager {
  /**
   * Sanitize display names to prevent echoing offensive content
   */
  safeDisplayName(username) {
    const banned = /\b(fag|nigg|cunt|bitch|whore|slut|retard|faggot|nigger|spic|chink|kike)\b/i;
    return (!username || banned.test(username)) ? 'there' : username;
  }

  /**
   * Build a rolling conversation state to maintain context
   */
  async buildConversationState(userContext, message, conversationHistory, existingState = null) {
    // Start with existing state or create new one
    const state = existingState || {
      user_profile: {},
      facts: [],
      goals: [],
      unresolved_questions: [],
      commitments: [],
      last_turn_summary: '',
      last_intent: '',
      last_sentiment: 'neutral',
      conversation_health_score: 50
    };

    // Update user profile from current context
    if (userContext) {
      if (userContext.username && !state.user_profile.username) {
        state.user_profile.username = this.safeDisplayName(userContext.username);
      }
      
      if (userContext.musicProfile) {
        // Update mood if changed
        if (userContext.musicProfile.mood && userContext.musicProfile.mood !== 'neutral') {
          state.user_profile.mood = userContext.musicProfile.mood;
        }
        
        // Update current status (replace old ones)
        const currentFacts = state.facts.filter(f => !f.startsWith('current status:') && !f.startsWith('currently listening:'));
        
        if (userContext.musicProfile.currentStatus) {
          currentFacts.push(`current status: ${userContext.musicProfile.currentStatus}`);
        }
        
        // Spotify context
        if (userContext.musicProfile.spotify?.currentTrack) {
          currentFacts.push(`currently listening: ${userContext.musicProfile.spotify.currentTrack.name}`);
        }
        
        state.facts = currentFacts;
      }
    }

    // Analyze current message for sentiment and goals
    const lowerMessage = message.toLowerCase();
    if (/(scared|worried|anxious|frustrated|stressed|help me|need help)/.test(lowerMessage)) {
      state.last_sentiment = 'distressed';
    } else if (/(excited|amazing|great|awesome|love|fantastic)/.test(lowerMessage)) {
      state.last_sentiment = 'positive';
    } else if (/(tired|bored|meh|whatever|okay|fine)/.test(lowerMessage)) {
      state.last_sentiment = 'low_energy';
    } else {
      state.last_sentiment = 'neutral';
    }

    // Detect music-related goals
    const newGoals = [];
    if (/(discover|find|recommend).*(music|artist|band)/.test(lowerMessage)) {
      newGoals.push('music discovery');
    }
    if (/(advice|help|guidance|what should i|how do i|suggest)/.test(lowerMessage)) {
      newGoals.push('seeking advice');
    }

    // Merge new goals with existing ones (remove duplicates)
    state.goals = [...new Set([...state.goals, ...newGoals])];

    // Extract potential unresolved questions from recent messages
    if (conversationHistory.length > 0) {
      const recentAssistantMessages = conversationHistory
        .filter(m => m.role === 'assistant')
        .slice(-2); // Last 2 assistant messages
      
      recentAssistantMessages.forEach(msg => {
        const questions = this.extractQuestions(msg.content);
        questions.forEach(q => {
          // Add as unresolved if not already asked
          if (!state.unresolved_questions.some(uq => uq.question.includes(q.slice(0, 20)))) {
            state.unresolved_questions.push({
              question: q,
              status: 'pending',
              timestamp: new Date()
            });
          }
        });
      });
    }

    // Last turn summary (keep it brief)
    state.last_turn_summary = `User: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`;

    return state;
  }

  /**
   * Extract questions from assistant messages
   */
  extractQuestions(text) {
    const questions = [];
    const sentences = text.split(/[.!?]+/);
    
    sentences.forEach(sentence => {
      if (sentence.trim().includes('?') || 
          /^(what|where|when|how|why|which|who|would you|do you|have you|are you|can you)/i.test(sentence.trim())) {
        questions.push(sentence.trim());
      }
    });
    
    return questions.slice(0, 3); // Limit to 3 questions per message
  }

  /**
   * Update conversation state after assistant response
   */
  async updateConversationStateAfterResponse(userContext, conversationId, assistantResponse, queryType) {
    if (!userContext?.conversationId || !conversationId) return;

    try {
      // Calculate conversation health score
      const healthScore = this.calculateConversationHealth(assistantResponse, queryType);
      
      const stateUpdate = {
        last_intent: queryType,
        conversation_health_score: healthScore,
        updated_at: new Date()
      };

      // Mark questions as answered if the response addresses them
      const existingState = await conversationService.getConversationState(userContext.userId, conversationId);
      if (existingState?.unresolved_questions) {
        const updatedQuestions = existingState.unresolved_questions.map(q => {
          if (q.status === 'pending' && this.responseAddressesQuestion(assistantResponse, q.question)) {
            return { ...q, status: 'answered' };
          }
          return q;
        });
        stateUpdate.unresolved_questions = updatedQuestions;
      }

      await conversationService.mergeConversationState(userContext.userId, conversationId, stateUpdate);
    } catch (error) {
      console.error('Error updating conversation state:', error);
    }
  }

  /**
   * Check if response addresses a question
   */
  responseAddressesQuestion(response, question) {
    const questionKeywords = question.toLowerCase().split(' ').filter(w => w.length > 3);
    const responseWords = response.toLowerCase().split(' ');
    
    return questionKeywords.some(keyword => responseWords.includes(keyword));
  }

  /**
   * Calculate conversation health score
   */
  calculateConversationHealth(response, queryType) {
    let score = 50; // Base score
    
    // Length appropriateness
    if (queryType === 'factual' && response.length > 100 && response.length < 400) score += 10;
    if (queryType === 'music_related' && response.length > 150) score += 10;
    
    // Question asking
    if (response.includes('?')) score += 10;
    
    // Avoid generic responses
    if (/(I'd be happy to help|How can I assist|Let me know)/.test(response)) score -= 20;
    
    return Math.max(0, Math.min(100, score));
  }
}

export default new ConversationStateManager();