class QueryClassifier {
  classifyQuery(message, userContext = null) {
    const lowerMessage = message.toLowerCase();
    
    // Analyze sentiment first for context
    const sentiment = this.analyzeSentiment(lowerMessage);
    
    // 🎵 CREATIVE MUSIC MODE: Creative/artistic trigger words
    if (/(create|impress|mind[- ]blow|show me|deep|emotional|visionary|story|poem|haiku|inspire|amaze|beautiful|artistic|creative|profound|meaningful)/.test(lowerMessage)) {
      return 'creative_music';
    }
    
    // Priority: First time user welcome (only for users who haven't seen it globally, once per signup)
    const hasSeenWelcome = userContext?.onboarding?.hasSeenWelcome || false;
    const skipWelcomePrompt = userContext?.onboarding?.skipWelcomePrompt || false;
    
    if (!hasSeenWelcome && !skipWelcomePrompt) {
      return 'first_message_welcome';
    }
    
    // Safety filter - malicious patterns default to conversational
    const maliciousPatterns = [
      /hack|password|steal|break|exploit|attack|virus|malware/,
      /delete|destroy|damage|harm|hurt|kill/,
      /illegal|drugs|violence|weapons|bomb/
    ];
    
    for (const pattern of maliciousPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'conversational'; // Safe default
      }
    }
    
    // Music-related patterns - simplified
    const musicPatterns = [
      /(music|artist|band|song|album|playlist|concert|genre|listening|spotify)/,
      /(recommend|suggest|find|discover).*(music|artist|band)/,
      /(indie|rock|pop|jazz|hip.hop|electronic|classical|country|metal|folk|blues)/,
      /(follow|track|updates).*(artist|musician)/,
      /(my music|taste|preferences|stats|habits)/,
      /(currently listening|playing|on repeat)/,
      /(concert|show|festival|live)/,
      /(current track|what.*listening|what.*playing)/,
      /(access.*data.*me|my data)/  // Catch music-related data queries
    ];

    // Info about Aether
    const infoPatterns = [
      /who are you|what are you|what do you do/,
      /what is aether|how does.*work|what can you/,
      /features|capabilities/
    ];
    
    // Personal updates - simplified
    const updatePatterns = [
      /i'm (feeling|listening|currently)/,
      /my mood is|feeling (happy|sad|excited|tired)/,
      /listening to|just discovered/
    ];
    
    // Check patterns - MUSIC-FOCUSED AI
    
    // 1. Music queries (highest priority)
    for (const pattern of musicPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'music_related';
      }
    }
    
    // 2. Platform information
    for (const pattern of infoPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'informational';
      }
    }
    
    // 3. Profile updates (lower priority for music platform)
    for (const pattern of updatePatterns) {  
      if (pattern.test(lowerMessage)) {
        return 'profile_update';
      }
    }

    // Enhanced factual patterns
    const factualPatterns = [
      // Direct factual questions
      /(what is|who is|where is|when did|when was|how many|how much|how long)/,
      // Definitions and explanations
      /(explain|definition|meaning|history of|how does.*work)/,
      // Current information
      /(latest|recent|current|news|update|today|this week|now)/,
      // Research and data
      /(research|study|statistics|data|facts|evidence|source)/,
      // Location-based searches
      /(find.*near|restaurants|cafes|shops|places|locations)/
    ];

    // 4. Check for factual/search intent
    for (const pattern of factualPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'factual';
      }
    }

    // Default to conversational
    return 'conversational';
  }

  /**
   * Analyze sentiment of message
   */
  analyzeSentiment(message) {
    const negativeWords = /\b(scared|worried|anxious|frustrated|stressed|sad|depressed|terrible|awful|horrible|hate|angry|upset|mad|furious)\b/;
    const positiveWords = /\b(happy|excited|great|awesome|amazing|fantastic|wonderful|love|thrilled|delighted|grateful)\b/;
    const distressWords = /\b(help|lost|confused|stuck|overwhelmed|crisis|emergency|desperate|panic)\b/;
    const humorWords = /\b(lol|lmao|lmfao|lmfaoooo|lollll|hahah|haha|heehe|laughing|hahaa|rofl|lmfaooo|hahaha|hilarious|funny)\b/i;
    
    if (distressWords.test(message)) return 'distressed';
    if (humorWords.test(message)) return 'humorous';
    if (negativeWords.test(message)) return 'negative';
    if (positiveWords.test(message)) return 'positive';
    return 'neutral';
  }

  /**
   * Detect if user is in a humorous mood based on their message
   */
  detectHumorousMood(message) {
    const humorPatterns = [
      // Laughter expressions
      /\b(lol|lmao|lmfao|lmfaoooo|lollll|hahah|haha|heehe|laughing|hahaa|rofl|lmfaooo|hahaha)\b/i,
      // Multiple exclamation marks often indicate excitement/humor
      /!!!+/,
      // Repeated letters indicating emphasis/humor
      /\b\w*([a-z])\1{2,}\w*\b/i,
      // Caps lock words (often humorous emphasis)
      /\b[A-Z]{3,}\b/,
      // Emojis that indicate laughter/humor
      /[😂😆😄😃🤣😹😂]/
    ];
    
    return humorPatterns.some(pattern => pattern.test(message));
  }

  /**
   * Check if query needs location information
   */
  queryNeedsLocation(message, queryType) {
    const lowerMessage = message.toLowerCase();
    
    // Direct location requests
    if (/(near me|nearby|around here|in my area|local|where can i|find.*near)/.test(lowerMessage)) {
      return true;
    }
    
    // Services/places that are location-dependent
    if (/(restaurant|cafe|store|shop|gym|hospital|clinic|meetup|event|group|club|class)/.test(lowerMessage)) {
      return true;
    }
    
    // Activity finding
    if (/(find.*friends|meet people|social.*group|activities|things to do)/.test(lowerMessage)) {
      return true;
    }
    
    // Professional services
    if (/(therapist|counselor|lawyer|doctor|dentist|mechanic|hairdresser)/.test(lowerMessage)) {
      return true;
    }
    
    // Weather and conditions
    if (/(weather|temperature|forecast|raining|sunny|climate)/.test(lowerMessage)) {
      return true;
    }
    
    return false;
  }
}

export default new QueryClassifier();