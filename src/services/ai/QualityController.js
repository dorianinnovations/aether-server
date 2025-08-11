class QualityController {
  /**
   * Get reply policy based on intent
   */
  getReplyPolicy(queryType) {
    const policies = {
      music_related: { 
        minLen: 50,
        maxLen: 500,
        minSentences: 1,
        steps: 0,
        useRag: true, // Use music preferences and context
        temperature: 0.8, // Enthusiastic about music
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      factual: { 
        minLen: 30, // Sometimes a short answer is perfect
        maxLen: 400,
        minSentences: 1, 
        steps: 0, 
        useRag: true, 
        temperature: 0.7, // More conversational
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      search: { 
        minLen: 50, 
        maxLen: 500,
        minSentences: 1, 
        steps: 0, 
        useRag: true, 
        temperature: 0.7, // Less robotic
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      conversational: { 
        minLen: 20, // Sometimes "lol yeah" is the right response
        maxLen: 400, // Allow for longer when natural
        minSentences: 1, 
        steps: 0, 
        useRag: false, 
        temperature: 0.8, // More personality
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      creative_music: { 
        minLen: 100, 
        maxLen: 600,
        minSentences: 2, 
        steps: 0, 
        useRag: false, 
        temperature: 0.9, 
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      informational: { 
        minLen: 50, 
        maxLen: 400,
        minSentences: 1, 
        steps: 0, 
        useRag: false, 
        temperature: 0.7, 
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      profile_update: { 
        minLen: 30, 
        maxLen: 300,
        minSentences: 1, 
        steps: 0, 
        useRag: false, 
        temperature: 0.8, 
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      },
      first_message_welcome: { 
        minLen: 80, 
        maxLen: 350,
        minSentences: 2, 
        steps: 0, 
        useRag: false, 
        temperature: 0.8, 
        top_p: 0.9,
        requiresEmpathy: false,
        requiresPlan: false,
        requiresQuestion: false
      }
    };

    return policies[queryType] || policies.conversational;
  }

  /**
   * Check if response needs retry based on quality heuristics
   */
  needsRetry(text, queryType) {
    const policy = this.getReplyPolicy(queryType);
    
    // Only retry for truly problematic responses
    
    // Way too short (like single word responses when more is needed)
    if (text.length < policy.minLen && policy.minLen > 50) {
      return true;
    }
    
    // Extremely long and rambling
    if (text.length > policy.maxLen * 1.5) {
      return true;
    }
    
    // Obviously broken or empty responses
    if (text.trim().length < 3) {
      return true;
    }
    
    // Generic corporate speak
    if (/(I'd be happy to help|How can I assist|Let me know if you need)/i.test(text) && text.length < 50) {
      return true;
    }
    
    // Excessive repetition (but be much more lenient)
    const words = text.toLowerCase().split(/\s+/).filter(word => word.length > 4);
    if (words.length > 10) {
      const wordCounts = {};
      words.forEach(word => wordCounts[word] = (wordCounts[word] || 0) + 1);
      const maxWordCount = Math.max(...Object.values(wordCounts));
      if (maxWordCount > Math.floor(words.length / 5) && maxWordCount > 5) { // Much more lenient
        return true;
      }
    }
    
    return false; // Default to accepting the response
  }

  /**
   * Generate actionable suggestions based on conversation state and intent
   */
  generateActionSuggestions(conversationState, queryType, message) {
    const suggestions = [];
    
    // Music-related suggestions
    if (queryType === 'music_related') {
      suggestions.push('explore similar artists');
      suggestions.push('set up artist notifications');
      suggestions.push('discover new music');
    }
    
    return suggestions.slice(0, 3);
  }

  /**
   * Generate follow-up options for continuation
   */
  generateFollowUpOptions(conversationState, queryType) {
    const options = [];
    
    if (queryType === 'music_related') {
      options.push('Discover more');
      options.push('Set up tracking');
      options.push('Music analysis');
    } else if (queryType === 'factual') {
      options.push('Get more details');
      options.push('Related topics');
      options.push('Save this info');
    } else {
      options.push('Tell me more');
      options.push('Change topic');
      options.push('Ask question');
    }
    
    return options;
  }
}

export default new QualityController();