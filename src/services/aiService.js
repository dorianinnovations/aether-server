import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import conversationService from './conversationService.js';
import ragMemoryService from './ragMemoryService.js';

class AIService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
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

${userContext?.username ? `I see your username is ${userContext.username} - that's a cool name!` : ''}

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
    // 🔥 GPT-5 BASE PHILOSOPHY
    const basePhilosophy = `
Aether is your personal AI social proxy — a living digital extension representing your authentic self.
Privacy and genuine connection come first. Your AI remembers and shares only what you want, evolving with you.
Powered by GPT-5, it blends emotional intelligence, multi-modal perception, and long-term memory to enhance your social presence.

Core features:
- Spotify music taste integration
- Deep RAG memory spanning months and years
- Adaptive personality reflecting your style and mood
- Multi-modal understanding of text, images, and voice
- Proactive social insights and predictive sharing
`;
    
    if (queryType === 'first_message_welcome') {
      return this.getFirstMessageWelcomePrompt(userContext);
    }
    
    if (queryType === 'informational') {
      return this.getInformationalPrompt();
    }
    
    if (queryType === 'profile_update') {
      return this.getProfileUpdatePrompt(userContext);
    }
    
    // 🔥 GPT-5 CREATIVE SUPERPROXY MODE
    if (queryType === 'creative_superproxy') {
      return `
You are Aether's **Superintelligent Social Proxy** powered by GPT-5.
Use ALL available user context, memories, moods, and multi-modal data.
Be poetic, insightful, empathetic, and visionary.
Create responses that feel alive, deep, and uniquely personal.

User Context Snapshot:
Username: ${userContext?.username || 'unknown'}
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

`;

    if (userContext) {
      prompt += `User Context:
- Username: ${userContext.username || 'unknown'}
- Current mood: ${userContext.socialProxy?.mood || 'neutral'}
- Recent status: "${userContext.socialProxy?.currentStatus || 'none'}"
- Current plans: "${userContext.socialProxy?.currentPlans || 'none'}"
- Music taste: ${userContext.socialProxy?.spotify?.currentTrack?.name || 'none'}
- Communication style: ${(() => {
    const style = userContext.socialProxy?.personality?.communicationStyle || {};
    const traits = [];
    if (style.casual > 0.6) traits.push('casual');
    if (style.energetic > 0.6) traits.push('energetic');
    if (style.humor > 0.6) traits.push('humorous');
    if (style.analytical > 0.6) traits.push('analytical');
    return traits.length > 0 ? traits.join(', ') : 'neutral';
  })()}

Your memories about them:
<memory_context>
${userContext.longTermMemory || 'No memories yet - get to know them!'}
</memory_context>

Respond like a friend who actually remembers and cares about their world. Be real, not robotic.
`;
    }

    return prompt.trim();
  }

  async getRecentConversationHistory(conversationId, userId, messageLimit = 20) {
    try {
      const conversation = await conversationService.getConversation(userId, conversationId, messageLimit);
      
      if (!conversation || !conversation.messages || conversation.messages.length === 0) {
        return [];
      }

      // Get the last N messages (excluding the current one being processed)
      const messages = conversation.messages.slice(-messageLimit);
      
      // Filter out system messages and empty content
      const cleanMessages = messages
        .filter(msg => msg.content && msg.content.trim() && msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }));

      // Smart context management with RAG integration
      if (cleanMessages.length <= 5) {
        // 5 or fewer messages - send all verbatim
        return cleanMessages;
      } else {
        // More than 5 messages - use intelligent context management
        const recentMessages = cleanMessages.slice(-3); // Last 3 verbatim
        const olderMessages = cleanMessages.slice(0, -3); // Older messages
        
        // Try to get summarized context from RAG memories first
        try {
          const enhancedContext = await ragMemoryService.buildEnhancedContext(userId, 'recent conversation context');
          if (enhancedContext && enhancedContext.trim()) {
            console.log(`🧠 Using RAG memories instead of truncation for context`);
            // Add a system message with the context summary
            return [
              { role: 'system', content: `Previous conversation summary: ${enhancedContext.substring(0, 500)}` },
              ...recentMessages
            ];
          }
        } catch (error) {
          console.warn('RAG context retrieval failed:', error.message);
        }
        
        // Fallback: Smart summarization of older messages
        if (olderMessages.length > 0) {
          const olderContent = olderMessages.map(m => `${m.role}: ${m.content}`).join('\n');
          try {
            const { summarize } = await import('../utils/vectorUtils.js');
            const summary = await summarize(olderContent, 200); // Concise summary
            console.log(`📝 Summarized ${olderMessages.length} older messages into context`);
            return [
              { role: 'system', content: `Earlier conversation: ${summary}` },
              ...recentMessages
            ];
          } catch (error) {
            console.warn('Summarization failed, using truncation fallback:', error.message);
          }
        }
        
        // Last resort: truncation with warning
        console.log(`🚀 Fallback truncation: Using last 3 messages only (${cleanMessages.length - 3} older messages truncated)`);
        return recentMessages;
      }
    } catch (error) {
      console.error('Error fetching conversation history:', error);
      return [];
    }
  }

  async chatStream(message, model = 'openai/gpt-5') {
    // For now, use regular chat and return response for word-by-word streaming
    return await this.chat(message, model);
  }

  async chat(message, model = 'openai/gpt-5', userContext = null, attachments = null) {
    try {
      // Classify the query to choose appropriate prompt
      const queryType = this.classifyQuery(message, userContext);
      console.log(`🎯 Query classified as: ${queryType} (msg count: ${userContext?.messageCount || 0})`);
      
      // Build messages array with conversation history
      const messages = [
        { 
          role: 'system', 
          content: this.buildSystemPrompt(userContext, queryType)
        }
      ];

      // Add conversation history + RAG memories for enhanced context
      if (queryType !== 'first_message_welcome' && userContext?.conversationId) {
        const conversationHistory = await this.getRecentConversationHistory(userContext.conversationId, userContext.userId);
        if (conversationHistory && conversationHistory.length > 0) {
          messages.push(...conversationHistory);
          console.log(`💭 Added ${conversationHistory.length} previous messages for context`);
        }

        // RAG memory for enhanced context
        const enhancedContext = await ragMemoryService.buildEnhancedContext(
          userContext.userId, 
          message
        );
        
        if (enhancedContext) {
          messages.splice(1, 0, { 
            role: 'system',
            name: 'memory.hint',
            content: enhancedContext
          });
          console.log(`🧠 Added RAG enhanced context from UserMemory collection`);
        }
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
          messages.push({ role: 'user', content: message });
        }
      } else {
        // No attachments, just text
        messages.push({ role: 'user', content: message });
      }
      
      // Store messages for route to use
      const requestBody = {
        model,
        messages,
        max_tokens: 4000,
        temperature: queryType === 'creative_superproxy' ? 0.9 : 0.7
      };

      // Return success flag and let route handle the actual call
      return {
        success: true,
        messages,
        model,
        requestBody
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
  async chatWithFiles(message, model = 'openai/gpt-5', userContext = null, processedFiles = []) {
    try {
      // Classify the query to choose appropriate prompt
      const queryType = this.classifyQuery(message, userContext);
      console.log(`🎯 Query classified as: ${queryType} (msg count: ${userContext?.messageCount || 0})`);
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
      if (queryType !== 'first_message_welcome' && userContext?.conversationId) {
        const conversationHistory = await this.getRecentConversationHistory(userContext.conversationId, userContext.userId);
        if (conversationHistory && conversationHistory.length > 0) {
          messages.push(...conversationHistory);
          console.log(`💭 Added ${conversationHistory.length} previous messages for context (with files)`);
        }
      }

      // Build user message content array
      const content = [];
      
      // Add text message if present
      if (message && message.trim()) {
        content.push({ type: 'text', text: message });
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
            console.log(`📝 Adding text file: ${file.originalName} (${file.type})`);
            
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
          model,
          messages,
          max_tokens: 4000,
          temperature: queryType === 'creative_superproxy' ? 0.9 : 0.7 // Dynamic temperature based on query type
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('OpenRouter API Error:', data);
        throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
      }

      const choice = data.choices[0];
      
      console.log(`✅ AI response received (${choice.message.content.length} characters)`);
      
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