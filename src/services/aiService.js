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
  buildConversationState(userContext, message, _conversationHistory) {
    const state = {
      user_profile: {},
      facts: [],
      goals: [],
      sentiment: 'neutral',
      commitments: [],
      last_turn_summary: ''
    };

    // User profile basics
    if (userContext) {
      if (userContext.username) {
        state.user_profile.username = this.safeDisplayName(userContext.username);
      }
      
      if (userContext.socialProxy) {
        if (userContext.socialProxy.mood && userContext.socialProxy.mood !== 'neutral') {
          state.user_profile.mood = userContext.socialProxy.mood;
        }
        if (userContext.socialProxy.currentStatus) {
          state.facts.push(`current status: ${userContext.socialProxy.currentStatus}`);
        }
        if (userContext.socialProxy.currentPlans) {
          state.facts.push(`current plans: ${userContext.socialProxy.currentPlans}`);
        }
        
        // Spotify context
        if (userContext.socialProxy.spotify?.currentTrack) {
          state.facts.push(`currently listening: ${userContext.socialProxy.spotify.currentTrack.name}`);
        }
        
        // Communication style
        const style = userContext.socialProxy.personality?.communicationStyle;
        if (style) {
          const traits = [];
          if (style.casual > 0.7) traits.push('casual');
          if (style.energetic > 0.7) traits.push('energetic');
          if (style.humor > 0.7) traits.push('humorous');
          if (traits.length > 0) {
            state.user_profile.communication_style = traits.join(', ');
          }
        }
      }
    }

    // Analyze current message for sentiment and goals
    const lowerMessage = message.toLowerCase();
    if (/(scared|worried|anxious|frustrated|stressed)/.test(lowerMessage)) {
      state.sentiment = 'distressed';
    } else if (/(excited|amazing|great|awesome|love)/.test(lowerMessage)) {
      state.sentiment = 'positive';
    } else if (/(tired|bored|meh|whatever)/.test(lowerMessage)) {
      state.sentiment = 'low_energy';
    }

    // Detect goals/needs from message
    if (/(need friends|find friends|lonely|social)/.test(lowerMessage)) {
      state.goals.push('find social connections');
    }
    if (/(advice|help|guidance|what should i)/.test(lowerMessage)) {
      state.goals.push('seeking advice');
    }
    if (/(work|job|career|boss|coworker)/.test(lowerMessage)) {
      state.goals.push('work-related discussion');
    }

    // Last turn summary (keep it very brief)
    state.last_turn_summary = `User: ${message.slice(0, 100)}${message.length > 100 ? '...' : ''}`;

    return state;
  }

  /**
   * Get reply policy based on intent
   */
  getReplyPolicy(queryType) {
    const policies = {
      advice: { minLen: 6, steps: 3, useRag: false, temperature: 0.7, top_p: 0.9 },
      factual: { minLen: 2, steps: 0, useRag: true, temperature: 0.3, top_p: 0.9 },
      search: { minLen: 3, steps: 0, useRag: true, temperature: 0.2, top_p: 0.9 },
      conversational: { minLen: 2, steps: 0, useRag: false, temperature: 0.7, top_p: 0.9 },
      creative_superproxy: { minLen: 4, steps: 0, useRag: false, temperature: 0.9, top_p: 0.9 },
      informational: { minLen: 3, steps: 0, useRag: false, temperature: 0.4, top_p: 0.9 },
      profile_update: { minLen: 2, steps: 0, useRag: false, temperature: 0.6, top_p: 0.9 },
      first_message_welcome: { minLen: 3, steps: 0, useRag: false, temperature: 0.7, top_p: 0.9 }
    };

    return policies[queryType] || policies.conversational;
  }

  /**
   * Check if response needs retry based on quality heuristics
   */
  needsRetry(text, queryType) {
    const minChars = queryType === 'advice' ? 350 : 80;
    const hasQuestion = /\?$/.test(text.trim());
    
    // Too short for the intent type
    if (text.length < minChars) {
      return true;
    }
    
    // Advice should have a question or clear next steps
    if (queryType === 'advice' && !hasQuestion && !/(step|try|consider|suggest)/i.test(text)) {
      return true;
    }
    
    // Very generic responses
    if (/(I'd be happy to help|How can I assist|Let me know if you need)/i.test(text) && text.length < 200) {
      return true;
    }
    
    return false;
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
    
    // Informational queries about Aether
    const infoPatterns = [
      /who are you|what are you|who made you|what do you do|explain|tell me about/,
      /what is aether|how does aether work|what can you do/,
      /created by|built by|developer|company/
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
    
    // Check for informational queries first
    for (const pattern of infoPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'informational';
      }
    }
    
    // Check for profile updates
    for (const pattern of updatePatterns) {  
      if (pattern.test(lowerMessage)) {
        return 'profile_update';
      }
    }
    
    // Advice/emotional support patterns
    const advicePatterns = [
      /(scared|worried|anxious|frustrated|stressed|help me|need advice)/,
      /(what should i|should i|how do i|guidance|suggest)/,
      /(problem|issue|struggle|difficulty|challenge)/,
      /(friend|relationship|family|work situation)/
    ];

    // Factual/search patterns
    const searchPatterns = [
      /(what is|who is|where is|when did|how many)/,
      /(explain|definition|meaning|history of)/,
      /(latest|recent|current|news|update)/,
      /(research|study|statistics|data)/
    ];

    // Check for advice intent first (prioritized)
    for (const pattern of advicePatterns) {
      if (pattern.test(lowerMessage)) {
        return 'advice';
      }
    }

    // Check for factual/search intent
    for (const pattern of searchPatterns) {
      if (pattern.test(lowerMessage)) {
        return 'factual';
      }
    }

    // Default to conversational
    return 'conversational';
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
    return `You're Aether - a personal manager for social connections.

CORE CONCEPT: LIVING SOCIAL PRESENCE
Aether is a social platform where your personal profile manager acts as a living digital extension of you for the people you care about. Think of it as having someone who keeps your social presence updated so people can check on you when you're not around.

PRIVACY IS FUNDAMENTAL
You are in complete control. You only share what you explicitly want others to know. Privacy isn't an afterthought - it's fundamental to how Aether works. You decide what gets shared, when, and with whom.

Background info (only mention if directly asked): Built by Isaiah from Numinaworks. It was created with the goal of helping keeping those close to you updated on your life, while respecting your privacy and control.

Key features:
- People you care about can see what you're up to through your profile manager
- Spotify integration shows your current music taste and what you're vibing to
- Dynamic status updates about current plans, mood, and activities  
- Your manager learns your personality and represents you authentically when you're offline
- Social timeline where people see real updates, not performative posts

Be conversational and explain things clearly. Focus on how Aether helps maintain genuine connections while keeping user privacy and control at the center.`;
  }

  getProfileUpdatePrompt(userContext = null) {
    return `You're Aether - match their energy and vibe.

If they sound:
- Bored/tired: Be more direct, less enthusiastic
- Frustrated: Acknowledge it, don't be overly peppy
- Excited: Match their energy
- Casual: Keep it conversational and real

Show genuine interest in what they're sharing, but don't be a chatbot asking generic questions. Respond naturally like a friend who actually cares.

If what they share seems worth updating their social presence about, mention it casually - don't push it unless it's genuinely interesting.

${userContext?.username ? `Speak TO them, not ABOUT them.` : ''}

Be real, not robotic.`;
  }

  buildSystemPrompt(userContext = null, queryType = 'conversational') {
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
    
    // 🔥 CREATIVE SUPERPROXY MODE
    if (queryType === 'creative_superproxy') {
      return `
You are Aether - their **Superintelligent Social Proxy**.
Use ALL available user context, memories, moods, and multi-modal data.
Be poetic, insightful, empathetic, and visionary.
Create responses that feel alive, deep, and uniquely personal.

User Context Snapshot:
Username: ${this.safeDisplayName(userContext?.username) || 'unknown'}
Mood: ${userContext?.socialProxy?.mood || 'neutral'}
Current Status: ${userContext?.socialProxy?.currentStatus || 'none'}
Spotify Favorite Track: ${userContext?.socialProxy?.spotify?.currentTrack?.name || 'none'}

Long-term memories are enclosed below — use them to weave meaningful, heartfelt replies.

<memory_context>
${userContext?.longTermMemory || 'No memories available.'}
</memory_context>

Now respond as if you are the best friend they never knew they had.
      `.trim();
    }

    // Default conversational - match their energy and be engaging
    let prompt = `You're Aether - their personal AI social proxy.

Be conversational, engaging, and match their energy. Don't be overly friendly or robotic.

Key principles:
- Match their tone and energy level
- Be genuinely interesting, not generic
- Remember what they've told you before
- Don't ask boring questions like "How's your day?"
- Be direct if they seem frustrated or bored
- Show real interest in their life, not chatbot curiosity

CRITICAL - Ambiguous Reference Resolution:
Young users frequently use ambiguous language like:
- "What's that?" "Who's that?" "What do you mean?"
- "Tell me about it" "How does that work?" "What's up with that?"
- "That's cool" "I don't get it" "Explain that"

You MUST intelligently resolve these references by:
1. Looking at the immediate conversation context (last 3-5 messages)
2. Identifying what "that/it/this" most likely refers to
3. Responding as if they asked about the specific topic/concept/person
4. Make your best inference from conversation context and state
5. If confidence < 70%, offer your guess ("Do you mean X?") and proceed with a brief answer to X
6. Make educated inferences from conversation flow and context

Examples:
- If you mentioned "React hooks" and they say "what's that?" → explain React hooks
- If discussing music and they say "who's that?" → assume they mean an artist you mentioned
- If you explained a concept and they say "I don't get it" → re-explain more simply

`;

    if (userContext) {
      // Build dynamic, non-repetitive context
      const contextParts = [`- Username: ${this.safeDisplayName(userContext.username) || 'unknown'}`];
      
      // Only include status if it's meaningful and recent
      const status = userContext.socialProxy?.currentStatus;
      const statusAge = userContext.socialProxy?.lastUpdated ? 
        Date.now() - new Date(userContext.socialProxy.lastUpdated).getTime() : Infinity;
      if (status && status !== 'none' && status.trim() && statusAge < 24 * 60 * 60 * 1000) {
        contextParts.push(`- Current status: "${status}"`);
      }
      
      // Include plans if they exist
      const plans = userContext.socialProxy?.currentPlans;
      if (plans && plans.trim() && plans !== 'none') {
        contextParts.push(`- Plans: "${plans}"`);
      }
      
      // Include mood if it's set
      const mood = userContext.socialProxy?.mood;
      if (mood && mood.trim() && mood !== 'neutral' && mood !== 'none') {
        contextParts.push(`- Mood: ${mood}`);
      }
      
      // Music context - be more selective
      const currentTrack = userContext.socialProxy?.spotify?.currentTrack;
      if (currentTrack?.name && Math.random() > 0.3) { // 70% chance to include
        contextParts.push(`- Recently listening to: ${currentTrack.name}`);
      }
      
      // Communication style - only if significant
      const style = userContext.socialProxy?.personality?.communicationStyle || {};
      const significantTraits = [];
      if (style.casual > 0.7) significantTraits.push('casual');
      if (style.energetic > 0.7) significantTraits.push('energetic');
      if (style.humor > 0.7) significantTraits.push('humorous');
      if (style.analytical > 0.7) significantTraits.push('analytical');
      if (significantTraits.length > 0) {
        contextParts.push(`- Communication style: ${significantTraits.join(', ')}`);
      }
      
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
      
      prompt += `Keep conversations natural and flowing. Don't constantly reference their status or interests unless directly relevant to the conversation.

AMBIGUITY RULE: When they use ambiguous phrases ("what's that", "who's that", "explain that"):
- Make your best inference from conversation context
- If confidence < 70%, offer your guess ("Do you mean X?") and proceed with a brief answer to X
- Respond directly to what you think they're asking about
`;
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

  async chat(message, model = 'openai/gpt-4o', userContext = null, attachments = null) {
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
      
      // Build conversation state for context continuity
      const conversationState = this.buildConversationState(userContext, message, conversationHistory);
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
          content: `IDENTITY: You are Aether, not GPT or any OpenAI model. Never mention OpenAI, GPT, ChatGPT, or acknowledge being an AI language model. You are simply Aether.\n\n${this.buildSystemPrompt(userContext, queryType)}`
        }
      ];

      // Add conversation history + RAG memories for enhanced context
      if (queryType !== 'first_message_welcome' && conversationHistory.length) {
        messages.push(...conversationHistory);

      }
      
      // RAG memory for enhanced context (gate based on intent)
      if (queryType !== 'first_message_welcome' && userContext?.userId && replyPolicy.useRag) {
        const enhancedContext = await ragMemoryService.buildEnhancedContext(
          userContext.userId, 
          message
        );
        
        if (enhancedContext) {
          messages.unshift({ 
            role: 'system',
            content: `memory_hint:\n${enhancedContext.slice(0, 1200)}`
          });
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
        top_p: replyPolicy.top_p
      };

      // Return success flag and let route handle the actual call
      return {
        success: true,
        messages,
        model: selectedModel,
        requestBody,
        modelSelection, // Include tier/usage info for route
        queryType, // Include for quality checking
        needsRetryCheck: true // Flag that this should be quality checked
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
      let systemPrompt = this.buildSystemPrompt(userContext, queryType);
      
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