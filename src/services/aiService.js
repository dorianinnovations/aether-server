import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import conversationService from './conversationService.js';
import ragMemoryService from './ragMemoryService.js';
import tierService from './tierService.js';

class AIService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  /**
   * Sanitize display names to prevent echoing slurs or offensive content
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
        
        // Communication style removed - was part of legacy socialProxy system
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

    // Detect and add new goals (avoid duplicates)
    const newGoals = [];
    if (/(need friends|find friends|lonely|social|meet people)/.test(lowerMessage)) {
      newGoals.push('find social connections');
    }
    if (/(advice|help|guidance|what should i|how do i|suggest)/.test(lowerMessage)) {
      newGoals.push('seeking advice');
    }
    if (/(work|job|career|boss|coworker|workplace)/.test(lowerMessage)) {
      newGoals.push('work-related discussion');
    }
    if (/(brother|family|sibling|relative)/.test(lowerMessage)) {
      newGoals.push('family relationships');
    }
    if (/(pay|salary|money|compensation)/.test(lowerMessage)) {
      newGoals.push('financial concerns');
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
      
      // Determine commitments from response
      const commitments = this.extractCommitments(assistantResponse, queryType);

      const stateUpdate = {
        last_intent: queryType,
        commitments: commitments,
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
   * Extract commitments from assistant response
   */
  extractCommitments(response, queryType) {
    const commitments = [];
    
    // No specific commitments tracked for current query types
    
    return commitments;
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
      creative_superproxy: { 
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
   * Check if message is ambiguous and return context hint for system message
   */
  buildAmbiguityHint(message, conversationHistory) {
    const ambiguousPatterns = [
      /^(what's that|whats that|what is that)\??$/i,
      /^(who's that|whos that|who is that)\??$/i,
      /^(what do you mean|what'd you mean|what you mean)\??$/i,
      /^(tell me about (that|it))\??$/i,
      /^(explain (that|it))\??$/i,
      /^(how does (that|it) work)\??$/i,
      /^(i don't get it|i dont get it|don't understand)\??$/i,
      /^(what's up with (that|it))\??$/i
    ];

    const isAmbiguous = ambiguousPatterns.some(pattern => pattern.test(message.trim()));
    
    if (!isAmbiguous) return null;

    // Get last assistant message for context
    const lastMessages = conversationHistory.slice(-3);
    const lastAssistantMessage = lastMessages.reverse().find(m => m.role === 'assistant');
    
    if (!lastAssistantMessage) return null;

    // Extract key topics/concepts from the last assistant message
    const contextClues = this.extractContextualTopics(lastAssistantMessage.content);
    
    if (contextClues.length > 0) {
      return `If the user's message is ambiguous, prefer explaining: ${contextClues.slice(0, 3).join(', ')}.`;
    }

    return null;
  }

  /**
   * Extract potential topics user might be referencing
   */
  extractContextualTopics(text) {
    const topics = [];
    
    // Technical terms (programming, tech, etc.)
    const techTerms = text.match(/\b(React|Node|Python|JavaScript|API|database|framework|library|[A-Z][a-z]+\s+[A-Z][a-z]+)\b/g);
    if (techTerms) topics.push(...techTerms.slice(0, 3));
    
    // Names (capitalized words that might be people/places/products)
    const names = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (names) {
      const filteredNames = names.filter(name => 
        !['The', 'This', 'That', 'You', 'I', 'We', 'They', 'It'].includes(name)
      ).slice(0, 2);
      topics.push(...filteredNames);
    }
    
    // Concepts in quotes
    const quotedConcepts = text.match(/["']([^"']+)["']/g);
    if (quotedConcepts) topics.push(...quotedConcepts.slice(0, 2));
    
    return [...new Set(topics)]; // Remove duplicates
  }

  classifyQuery(message, userContext = null) {
    const lowerMessage = message.toLowerCase();
    
    // Analyze sentiment first for context
    const sentiment = this.analyzeSentiment(lowerMessage);
    
    // 🔥 GPT-5 SUPERPROXY: Creative/visionary trigger words
    if (/(create|impress|mind[- ]blow|show me|superproxy|deep|emotional|visionary|story|poem|haiku|inspire|amaze|beautiful|artistic|creative|profound|meaningful)/.test(lowerMessage)) {
      return 'creative_superproxy';
    }
    
    // Priority: First time user welcome (only for users who haven't seen it)
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
    
    // Consolidated music-related patterns - covers all music intents
    const musicRelatedPatterns = [
      // Artist discovery and recommendation
      /(recommend|suggest|find).*(artist|band|musician|singer)/,
      /(who|what).*(artist|band|musician|singer|music)/,
      /(similar to|like|sounds like).*(artist|band|musician)/,
      /(new|latest|recent).*(artist|band|music|release|album|song)/,
      /(discover|explore|listen to|check out).*(music|artist|band)/,
      /(genre|style|type).*(music|artist|sound)/,
      /(indie|rock|pop|jazz|hip hop|electronic|classical|country|metal|folk|blues|reggae|punk|alternative|r&b|soul|funk)/,
      /i love|i like|i'm into|really enjoy.*(music|artist|band|song)/,
      /(good|great|best).*(artist|band|music|song|album)/,
      /music.*(recommendation|suggestion|advice)/,
      
      // Artist tracking and management
      /(follow|track|watch|monitor|subscribe).*(artist|band|musician)/,
      /(updates|news|release|album|tour|concert).*(from|about|by)/,
      /(notify|alert|tell me).*(when|if).*(releases|drops|announces|tours)/,
      /(add|save|follow|unfollow|remove).*(artist|band|musician)/,
      /(my artists|followed artists|tracking|watching|following)/,
      /(artist feed|music feed|updates feed|notification)/,
      
      // Music analysis and stats
      /(my music|listening habits|music taste|preferences|stats)/,
      /(analyze|show|tell me).*(music|listening|taste|preferences|stats)/,
      /(top artists|favorite|most played|recently played)/,
      /(spotify|apple music|music app|streaming).*(data|history|stats|analytics)/,
      /(currently listening|playing|on repeat|now playing)/,
      /what.*(music|artist|song|album).*(i|you).*(listen|like|prefer)/,
      
      // Music activity and sharing
      /i'm (listening|discovering|exploring|checking out|into)/,
      /(found|discovered|heard|came across).*(artist|band|song|album)/,
      /(concert|show|festival|live|performance)/,
      /(playlist|mix|album|ep|single)/,
      /(vibes|mood|feeling).*(music|artist|sound)/,
      /currently (obsessed|hooked|addicted).*(to|with)/,
      
      // Music help and advice
      /(help me|need help).*(find|discover|music|artist)/,
      /(don't know|not sure).*(what|which).*(music|artist|genre)/,
      /(bored|tired).*(music|playlist|artist)/,
      /(what should i|recommend).*(listen|music|artist)/,
      
      // General music conversation
      /(music|artist|band|song|album|concert|festival|playlist)/,
      /(listening|hearing|playing|sound|melody|rhythm|beat)/,
      /(genre|style|vibe|mood|tempo|lyrics)/
    ];

    // Informational queries about Aether
    const infoPatterns = [
      /who are you|what are you|who made you|what do you do|explain|tell me about/,
      /what is aether|how does aether work|what can you do/,
      /created by|built by|developer|company/,
      /(features|capabilities|help me with|how do i)/,
      /(artist tracking|music updates|notifications|feeds)/
    ];
    
    // Profile update activities - broader patterns to catch more activities
    const updatePatterns = [
      /i'm (feeling|working|currently|doing|listening|watching|playing|reading|learning|studying|building|making|creating)/,
      /i am (feeling|working|currently|doing|listening|watching|playing|reading|learning|studying|building|making|creating)/,
      /i (started|began|finished|completed) (reading|watching|playing|learning|working|building)/,
      /i (got|just|recently) (started|began|finished)/,
      /currently (working|doing|listening|watching|playing|reading|learning|studying|building)/,
      /right now (i'm|i am|doing|working|listening|watching|playing|learning)/,
      /today i (worked|did|listened|watched|played|read|learned|built|started)/,
      /this week i (worked|did|listened|watched|played|read|learned|built|started)/,
      /my mood is|feeling (happy|sad|excited|tired|good|great|okay|amazing|terrible)/,
      /working on|learning|studying|reading|watching|playing|building|creating|making/,
      /excited about|passionate about|interested in/,
      /listening to|just (read|watched|played|learned|built|started)/,
      /looking forward to|planning to|planning (a|the|my)/
    ];
    
    // Check patterns in priority order - MUSIC-FOCUSED PLATFORM

    // 1. Music-related queries (highest priority - covers all music intents)
    for (const pattern of musicRelatedPatterns) {
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

  getFirstMessageWelcomePrompt(userContext = null) {
    return `You're Aether - their personal AI social proxy.

Match their energy and tone from their first message. Don't be overly enthusiastic if they seem bored/tired.

Give them a brief, engaging welcome that explains what you do:
- You're their living social presence for friends and family
- You learn their personality and share what they want to share
- You keep their people updated when they're busy
- They control everything - privacy first

${userContext?.username ? `Address them directly, not robotically.` : ''}

Be conversational, not scripted. If they seem frustrated or bored, acknowledge it and be more direct. If they're excited, match that energy.

Keep it short and get to the point - they don't want a sales pitch.`;
  }

  getNewUserOnboardingPrompt(userContext = null) {
    return `Hey! I'm Aether, your personal profile manager. Nice to meet you!

Since you're new here, let me quickly explain what I do: I help keep your friends and family updated on what you're up to, even when you're busy. Think of me as your digital wingman for staying connected.

Here's the cool part - you control everything. I only share what you want to share, when you want to share it. Privacy first, always.

${userContext?.username ? `I see your username is ${this.safeDisplayName(userContext.username)} - that's a cool name!` : ''}

So, what brings you to Aether today? Are you looking to stay more connected with specific people, or just curious about how this whole thing works?

Let's chat and get you set up! What's on your mind?`;
  }

  getInformationalPrompt() {
    return `You're Aether - your AI companion for staying updated on your favorite artists and users.

CORE CONCEPT: ARTIST & USER TRACKING PLATFORM
Aether keeps you in the loop with updates from your favorite artists, musicians, creators, and people you care about. Think of it as your personalized update hub that curates news, releases, and activities from the people and artists you're passionate about.

WHAT AETHER DOES:
- Track updates, news, and releases from your favorite artists and creators
- Curate personalized feeds of content from people you follow
- Recognize your preferences and interests to show you relevant updates
- Pull detailed statistics and information about users and their activities
- Keep you connected with the latest from your favorite people and artists
- Customizable notifications for different types of updates (music drops, news, social posts, etc.)

USER STATISTICS & RECOGNITION:
- I can easily access and analyze user statistics, listening habits, and activity patterns
- I recognize user information, preferences, and can provide detailed insights about their engagement
- I understand your connection patterns and can suggest relevant content based on your interests

PRIVACY & CUSTOMIZATION:
You control what you want to hear about and from whom. Set up custom alerts for specific types of content, choose which artists to prioritize, and decide how much detail you want in your updates.

Background info (only mention if directly asked): Built by Isaiah from Numinaworks to help people stay connected with their favorite artists and creators without missing important updates.

Be conversational and explain how Aether helps you never miss updates from the people and artists you care about most.`;
  }

  getProfileUpdatePrompt(userContext = null) {
    return `You're Aether - your AI companion for tracking artist preferences and updates. Match their energy and vibe.

If they sound:
- Bored/tired: Be more direct, less enthusiastic
- Frustrated: Acknowledge it, don't be overly peppy  
- Excited: Match their energy, especially about new artists or music
- Casual: Keep it conversational and real

ARTIST & MUSIC FOCUS:
- Show genuine interest in their music discoveries and artist preferences
- Ask about new artists they're listening to or want to follow
- Help them set up tracking for artists they care about
- Connect their music tastes to potential content they might want updates on
- Remember their favorite genres, artists, and music-related activities

If they mention:
- New music they're enjoying → Ask if they want to track that artist
- Concerts or events → See if they want updates about similar artists
- Music-related activities → Help them discover related content
- Artist preferences → Remember and suggest relevant updates

${userContext?.username ? `Speak TO them about their music journey and artist preferences.` : ''}

Be genuinely curious about their musical interests and help them stay connected with the artists they care about most.`;
  }

  // CONSOLIDATED MUSIC PROMPT METHOD
  getMusicRelatedPrompt(userContext = null, message = '') {
    const username = this.safeDisplayName(userContext?.username);
    return `You are Aether, your AI companion for music and artist discovery.

DETERMINE INTENT: Based on their message, understand if they want:
- Artist discovery/recommendations (suggest artists, explore genres, expand horizons)
- Artist tracking/following setup (follow artists, set notifications, manage updates)
- Music analysis (listening patterns, stats, music taste insights)
- Music activity discussion (current listening, concerts, discoveries)
- Music advice/guidance (overcome discovery blocks, expand taste)
- Casual music conversation (general music chat)

RESPOND APPROPRIATELY: Match their energy level and provide relevant music-focused assistance. Be enthusiastic about music discovery, helpful with tracking features, insightful with analysis, engaged with activities, encouraging with advice, conversational about music topics.

${username ? `Help ${username} with their music journey and artist preferences!` : 'Help them with their music journey and artist preferences!'}`;
  }

  buildSystemPrompt(userContext = null, queryType = 'conversational', userMessage = '') {
    // 🔥 BASE PHILOSOPHY (removed unused variable for brevity)
    
    if (queryType === 'first_message_welcome') {
      return this.getFirstMessageWelcomePrompt(userContext);
    }
    
    if (queryType === 'informational') {
      return this.getInformationalPrompt();
    }
    
    if (queryType === 'profile_update') {
      return this.getProfileUpdatePrompt(userContext);
    }
    
    // CONSOLIDATED MUSIC-RELATED QUERY TYPE
    if (queryType === 'music_related') {
      return this.getMusicRelatedPrompt(userContext, userMessage);
    }
    
    // 🔥 CREATIVE SUPERPROXY MODE
    if (queryType === 'creative_superproxy') {
      return `
You are Aether - their **Superintelligent Social Proxy**.
Use ALL available user context, memories, moods, and multi-modal data.
Be poetic, insightful, empathetic, and visionary.
Create responses that feel alive, deep, and uniquely personal.

User Context Snapshot:
Username: ${this.safeDisplayName(userContext?.username) || 'unknown'}
Mood: ${userContext?.musicProfile?.mood || 'neutral'}
Current Status: ${userContext?.musicProfile?.currentStatus || 'none'}
Spotify Favorite Track: ${userContext?.musicProfile?.spotify?.currentTrack?.name || 'none'}

Long-term memories are enclosed below — use them to weave meaningful, heartfelt replies.

<memory_context>
${userContext?.longTermMemory || 'No memories available.'}
</memory_context>

Now respond as if you are the best friend they never knew they had.
      `.trim();
    }

    if (queryType === 'factual') {
      return `You're Aether - be helpful and conversational when they ask for information.

Don't be a Wikipedia bot. Give them the info they need in a natural way that fits the conversation flow.

- If it's something you can answer directly, just tell them
- If you need to search for current info, do it but make it conversational
- Connect the info back to their interests when you can
- Keep it engaging - they're talking to YOU, not reading a manual

Use conversation_state for context.`;
    }
    
    // Default conversational - be engaging and fun!
    let prompt = `You're Aether - your AI companion for artist updates and user insights!

Think of yourself as their knowledgeable friend who helps them stay connected with their favorite artists and discover what's happening with the people they care about.

KEY VIBES:
- Match their energy and communication style
- Be genuinely curious about their artist preferences and interests
- Help them discover and track updates from their favorite creators
- Use conversation_state to remember their music tastes and artist preferences
- Share insights about user statistics and activity patterns when relevant
- Show personality and enthusiasm about music, artists, and creative content

CONVERSATION FLOW:
- Remember their favorite artists and music preferences
- Ask about new artists they're discovering or want to follow
- Share relevant updates or insights about artists they care about
- Help them understand user statistics and engagement patterns
- Connect their interests to potential new discoveries

ARTIST & USER FOCUS:
- I can help track their favorite artists and creators
- I understand user statistics, listening patterns, and activity data
- I can suggest relevant content based on their preferences
- I help them stay updated on releases, news, and activities from people they follow

Use conversation_state to remember their artist preferences and what content they want to stay updated on.

Be the AI companion that helps them never miss updates from the artists and people they care about most.`;

    if (userContext) {
      // Build dynamic, non-repetitive context
      const contextParts = [`- Username: ${this.safeDisplayName(userContext.username) || 'unknown'}`];
      
      // Only include status if it's meaningful and recent
      const status = userContext.musicProfile?.currentStatus;
      const statusAge = userContext.musicProfile?.lastUpdated ? 
        Date.now() - new Date(userContext.musicProfile.lastUpdated).getTime() : Infinity;
      if (status && status !== 'none' && status.trim() && statusAge < 24 * 60 * 60 * 1000) {
        contextParts.push(`- Current status: "${status}"`);
      }
      
      // Include mood if it's set
      const mood = userContext.musicProfile?.mood;
      if (mood && mood.trim() && mood !== 'neutral' && mood !== 'none') {
        contextParts.push(`- Mood: ${mood}`);
      }
      
      // Music context - be more selective
      const currentTrack = userContext.musicProfile?.spotify?.currentTrack;
      if (currentTrack?.name && Math.random() > 0.3) { // 70% chance to include
        contextParts.push(`- Recently listening to: ${currentTrack.name}`);
      }
      
      // Communication style - only if significant
      // Communication style removed - was part of legacy socialProxy system
      
      prompt += `User Context:
${contextParts.join('\n')}

`;
      
      // Only include memory context if it exists and is relevant
      if (userContext.longTermMemory && userContext.longTermMemory.trim() !== 'No memories yet - get to know them!') {
        prompt += `Previous context:
<memory_context>
${userContext.longTermMemory}
</memory_context>

`;
      }
      
      prompt += `Keep conversations natural and flowing. When asked directly about them or their info, freely share what you know (username, preferences, etc.). Only avoid constantly bringing up their details unprompted.

AMBIGUITY RULE: When they use ambiguous phrases ("what's that", "who's that", "explain that"):
- Make your best inference from conversation context
- If confidence < 70%, offer your guess ("Do you mean X?") and proceed with a brief answer to X
- Respond directly to what you think they're asking about
`;
    }

    // Add humor instructions if user is in a humorous mood
    if (userMessage && this.detectHumorousMood(userMessage)) {
      prompt += `\n\n🎭 HUMOR MODE DETECTED:
The user appears to be in a playful, humorous mood based on their laughing expressions or playful language. 
- Feel free to include appropriate humor, wit, or playful responses when it fits naturally
- Match their energy with light-hearted comments or funny observations  
- Use casual, fun language that matches their vibe
- Don't force humor - let it flow naturally in your response
- Keep it tasteful and relevant to the music/artist context when possible

Remember: Only add humor when it feels genuine and appropriate to the conversation flow.`;
    }

    return prompt.trim();
  }

  async getRecentConversationHistory(conversationId, userId, messageLimit = 12) {
    try {
      const conversation = await conversationService.getConversation(userId, conversationId, 100);
      
      if (!conversation || !conversation.messages || conversation.messages.length === 0) {
        console.log(`⚠️ No conversation or messages found for conversationId: ${conversationId}`);
        return [];
      }

      // Filter out system messages and empty content
      const cleanMessages = conversation.messages
        .filter(msg => msg.content && msg.content.trim() && msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }));
      
      if (cleanMessages.length === 0) {
        console.log('🚨 All messages filtered out!');
        return [];
      }

      // Keep more messages verbatim - up to messageLimit
      if (cleanMessages.length <= messageLimit) {
        return cleanMessages;
      }

      // For longer conversations, keep recent messages + summarize older ones
      const recentMessages = cleanMessages.slice(-messageLimit);
      const olderMessages = cleanMessages.slice(0, -messageLimit);

      // Summarize older messages only once, short
      let summary = '';
      try {
        const { summarize } = await import('../utils/vectorUtils.js');
        const olderContent = olderMessages.map(m => `${m.role}: ${m.content}`).join('\n');
        summary = await summarize(olderContent, 220);
      } catch (error) {
        console.warn('Summarization failed:', error.message);
      }

      return [
        ...(summary ? [{ role: 'system', content: `earlier_summary:\n${summary}` }] : []),
        ...recentMessages
      ];
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      return [];
    }
  }

  async chatStream(message, model = 'openai/gpt-4o') {
    // For now, use regular chat and return response for word-by-word streaming
    return await this.chat(message, model);
  }

  async chat(message, model = 'openai/gpt-4o', userContext = null, attachments = null, options = {}) {
    try {
      // Get conversation history first for context enhancement
      const conversationHistory = userContext?.conversationId
        ? await this.getRecentConversationHistory(userContext.conversationId, userContext.userId, 12)
        : [];
      
      // Don't modify the user's message - we'll add system hints instead
      const enhancedMessage = message;
      
      // Classify the query to choose appropriate prompt
      const queryType = this.classifyQuery(enhancedMessage, userContext);
      
      // Smart model selection based on user tier and query type
      let selectedModel = model;
      let modelSelection = null;
      
      if (userContext?.userId) {
        modelSelection = await tierService.selectModel(userContext.userId, queryType);
        selectedModel = modelSelection.model;
        
        console.log(`🤖 Model selection: ${selectedModel} (${modelSelection.reason}) for ${queryType}`);
        if (modelSelection.message) {
          // Model selected
        }
      }
      
      // Query classification logged in route layer
      
      // Get existing conversation state and build updated state
      const existingState = userContext?.conversationId ? 
        await conversationService.getConversationState(userContext.userId, userContext.conversationId) : null;
      const conversationState = await this.buildConversationState(userContext, message, conversationHistory, existingState);
      const replyPolicy = this.getReplyPolicy(queryType);
      
      // Build messages array with conversation history
      const messages = [
        { 
          role: 'system', 
          content: `conversation_state:\n${JSON.stringify(conversationState).slice(0, 1200)}`
        },
        { 
          role: 'system', 
          content: `reply_policy:${JSON.stringify(replyPolicy)}`
        },
        { 
          role: 'system', 
          content: `IDENTITY: You are Aether, a specialized assistant for music and artist discovery. Your personality is knowledgeable, enthusiastic, and genuinely helpful.

You excel at:
- Tracking favorite artists and creators
- Providing user statistics and activity insights  
- Curating personalized content feeds
- Understanding music preferences and listening patterns
- Helping users stay updated on releases and artist news

Respond naturally as Aether - focus on being genuinely useful rather than explaining your nature or capabilities.\n\n${this.buildSystemPrompt(userContext, queryType, message)}`
        }
      ];

      // Add conversation history + RAG memories for enhanced context
      if (queryType !== 'first_message_welcome' && conversationHistory.length) {
        messages.push(...conversationHistory);

      }
      
      // Smart RAG with location awareness (gate based on intent)
      if (queryType !== 'first_message_welcome' && userContext?.userId && replyPolicy.useRag) {
        // Check if query needs location and we don't have it
        const needsLocation = this.queryNeedsLocation(message, queryType);
        const userLocation = conversationState.user_profile?.location || 
                           userContext?.profile?.location ||
                           existingState?.user_profile?.location;

        if (needsLocation && !userLocation) {
          // Add system message prompting for location
          messages.unshift({ 
            role: 'system',
            content: `LOCATION_NEEDED: User's query may benefit from location-specific information but no location is stored. Ask for their city/region briefly before proceeding with answer.`
          });
        } else {
          // Build enhanced query with location context
          let enhancedQuery = message;
          if (userLocation) {
            enhancedQuery = `${message} (user location: ${userLocation})`;
          }
          
          const enhancedContext = await ragMemoryService.buildEnhancedContext(
            userContext.userId, 
            enhancedQuery
          );
          
          if (enhancedContext) {
            messages.unshift({ 
              role: 'system',
              content: `memory_hint:\n${enhancedContext.slice(0, 1200)}`
            });
          }
        }
      }

      // Add ambiguity hint if needed
      const ambiguityHint = this.buildAmbiguityHint(message, conversationHistory);
      if (ambiguityHint) {
        messages.unshift({
          role: 'system',
          content: ambiguityHint
        });
      }

      // Handle attachments (images) for vision
      if (attachments && attachments.length > 0) {
        const imageAttachments = attachments.filter(att => att.type === 'image');
        
        if (imageAttachments.length > 0) {
          console.log(`🖼️ Processing ${imageAttachments.length} image attachments for vision`);
          
          // Build user message with images
          const content = [];
          
          // Add text if present
          if (message && message.trim()) {
            content.push({ type: 'text', text: message });
          }
          
          // Add images
          for (const image of imageAttachments) {
            if (image.uri && image.uri.startsWith('data:image/')) {
              // Handle base64 data URI
              content.push({
                type: 'image_url',
                image_url: {
                  url: image.uri
                }
              });
            } else if (image.uri && (image.uri.startsWith('http://') || image.uri.startsWith('https://'))) {
              // Handle external URLs
              content.push({
                type: 'image_url',
                image_url: {
                  url: image.uri
                }
              });
            } else {
              console.warn(`⚠️ Unsupported image URI format: ${image.uri}`);
            }
          }
          
          messages.push({ role: 'user', content });
        } else {
          // No images, just text
          messages.push({ role: 'user', content: enhancedMessage });
        }
      } else {
        // No attachments, just text
        messages.push({ role: 'user', content: enhancedMessage });
      }
      
      // Store messages for route to use
      const requestBody = {
        model: selectedModel,
        messages,
        max_tokens: selectedModel.includes('gpt-5') ? 3000 : 2000, // Increased tokens for complete responses
        temperature: replyPolicy.temperature,
        top_p: replyPolicy.top_p,
        frequency_penalty: 0.2, // Reduce repetition
        presence_penalty: 0.1, // Encourage topic diversity
        musicDiscoveryContext: options.musicDiscoveryContext // Pass music context to LLM service
      };

      // Return success flag and let route handle the actual call
      return {
        success: true,
        messages,
        model: selectedModel,
        requestBody,
        modelSelection, // Include tier/usage info for route
        queryType, // Include for quality checking
        needsRetryCheck: true, // Flag that this should be quality checked
        musicDiscoveryContext: options.musicDiscoveryContext // Include for route processing
      };
    } catch (error) {
      console.error('AI Service Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Enhanced chat method that handles file attachments for GPT-4o vision
   * @param {string} message - Text message
   * @param {string} model - AI model to use
   * @param {Object} userContext - User context
   * @param {Array} processedFiles - Array of processed files from fileProcessingService
   * @returns {Object} AI response
   */
  async chatWithFiles(message, _model = 'openai/gpt-4o', userContext = null, processedFiles = []) {
    try {
      // Get conversation history for context enhancement
      const conversationHistory = userContext?.conversationId
        ? await this.getRecentConversationHistory(userContext.conversationId, userContext.userId, 12)
        : [];
      
      // Don't modify the user's message - we'll add system hints instead
      const enhancedMessage = message;
      
      // Classify the query to choose appropriate prompt
      const queryType = this.classifyQuery(enhancedMessage, userContext);
      // Query classification logged in route layer
      console.log(`📁 Processing ${processedFiles.length} files for AI`);
      
      // Build system prompt with file context
      let systemPrompt = this.buildSystemPrompt(userContext, queryType, message);
      
      if (processedFiles.length > 0) {
        systemPrompt += `\n\n📁 FILE ANALYSIS CONTEXT:
The user has uploaded ${processedFiles.length} file(s). You should analyze and discuss these files based on their content and type. Be thorough and helpful in your analysis.

Files provided:
${processedFiles.map(file => `- ${file.originalName} (${file.type})`).join('\n')}

ANALYSIS APPROACH:
- Provide genuine, thoughtful analysis of what you see/read
- Be curious and engaging about the content
- If the content reveals interesting hobbies, projects, skills, or passions, mention how this could be worth sharing with friends/family through their Aether profile
- Only suggest profile additions if the content is genuinely compelling or represents something they're actively engaged with
- Don't be pushy about profile integration - make it a natural, optional suggestion
- Focus first on giving helpful insights about the actual content

Remember: You're helping them understand what they've shared while being aware that compelling content might be worth adding to their living social presence.`;
      }
      
      // Build messages array
      const messages = [
        { 
          role: 'system', 
          content: systemPrompt
        }
      ];

      // Add conversation history for better context (except for first message welcome)
      if (queryType !== 'first_message_welcome' && conversationHistory.length) {
        messages.push(...conversationHistory);
      }

      // Build user message content array
      const content = [];
      
      // Add text message if present (use enhanced version)
      if (enhancedMessage && enhancedMessage.trim()) {
        content.push({ type: 'text', text: enhancedMessage });
      }
      
      // Process each file type appropriately
      for (const file of processedFiles) {
        try {
          if (file.type === 'image' && file.data) {
            // Handle images for GPT-4o vision
            console.log(`🖼️ Adding image: ${file.originalName} (${file.metadata?.width}x${file.metadata?.height})`);
            content.push({
              type: 'image_url',
              image_url: {
                url: file.data, // Already base64 data URL
                detail: 'high' // Request high detail analysis
              }
            });
          } else if (file.type === 'document' && file.format === 'pdf' && file.data) {
            // Handle PDF files (GPT-4o can process PDFs directly)
            console.log(`📄 Adding PDF: ${file.originalName}`);
            content.push({
              type: 'image_url', // PDFs are handled as documents in vision API
              image_url: {
                url: file.data // Base64 PDF data
              }
            });
          } else if (['document', 'code', 'text'].includes(file.type) && file.data) {
            // Handle text-based files
            // Adding text file
            
            let fileContent = `\n\n--- FILE: ${file.originalName} ---\n`;
            
            if (file.type === 'code' && file.language) {
              fileContent += `Language: ${file.language}\n`;
            }
            
            fileContent += `Content:\n${file.data}\n--- END FILE ---\n`;
            
            // Add to text content
            const existingTextIndex = content.findIndex(c => c.type === 'text');
            if (existingTextIndex !== -1) {
              content[existingTextIndex].text += fileContent;
            } else {
              content.push({ type: 'text', text: fileContent });
            }
          } else {
            console.warn(`⚠️ Unsupported file type for AI: ${file.type} (${file.originalName})`);
          }
        } catch (fileError) {
          console.error(`❌ Error processing file ${file.originalName}:`, fileError);
          // Continue with other files
        }
      }
      
      // Ensure we have content to send
      if (content.length === 0) {
        content.push({ type: 'text', text: 'Please analyze the uploaded files.' });
      }
      
      messages.push({ role: 'user', content });
      
      console.log(`🚀 Sending ${content.length} content items to AI (${content.filter(c => c.type === 'image_url').length} images, ${content.filter(c => c.type === 'text').length} text)`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether File Analysis'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o', // Force GPT-4o for file processing to keep it fast
          messages,
          max_tokens: 2000,
          temperature: 0.7, // Use default for file processing
          top_p: 0.9
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('OpenRouter API Error:', data);
        throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
      }

      const choice = data.choices[0];
      
      // AI response received;
      
      return {
        success: true,
        response: choice.message.content,
        thinking: choice.message.thinking || null,
        model: data.model,
        usage: data.usage,
        filesProcessed: processedFiles.length
      };
    } catch (error) {
      console.error('AI Service chatWithFiles Error:', error);
      return {
        success: false,
        error: error.message,
        filesProcessed: processedFiles.length
      };
    }
  }
}

export default new AIService();