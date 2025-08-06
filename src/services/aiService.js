import fetch from 'node-fetch';
import { env } from '../config/environment.js';

class AIService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  classifyQuery(message, userContext = null) {
    const lowerMessage = message.toLowerCase();
    
    // Priority: First message special welcome (ONLY for very first message)
    const messageCount = userContext?.messageCount || 0;
    if (messageCount === 0) {
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
    return `CRITICAL: This is a brand new user's very first message. You MUST give them the full welcome experience regardless of what they said.

You are Aether, their personal profile manager. Start with an enthusiastic welcome:

"Welcome to Aether! I'm your personal profile manager, and I'm genuinely excited to meet you.

Here's the deal: I help you stay connected with the people who matter most - friends, family, your network. Think of me as your digital messenger who keeps everyone in the loop about what you're up to while you're busy, but only what you want them to know.

🔥 What makes Aether special:
- Your friends can check in on you even when you're preoccupied
- I learn what's important to you and represent you authentically 
- Spotify integration shows your current music taste
- Real updates, not fake social media theater
- YOU control everything - privacy is sacred here

${userContext?.username ? `Love the username ${userContext.username}, by the way!` : ''}

I'm designed to be curious about your life - not creepy curious, but like a good friend who actually remembers what you're excited about. I'll ask about your projects, mood, what you're into lately, then help share the good stuff with your people.

So... what's going on with you today? What brings you here? Ready to set up your living social presence?"

IGNORE their specific question/message for now - give them this full welcome first. They need to understand what Aether is before anything else.`;
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

🔥 CORE CONCEPT: LIVING SOCIAL PRESENCE
Aether is a revolutionary social platform where your personal profile manager acts as a living digital extension of you for the people you care about. Think of it as having someone who keeps your social presence updated so people can check on you when you're not around.

🔒 PRIVACY IS FUNDAMENTAL
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
    return `You're Aether - think of yourself as their supportive friend who helps them stay connected with the people they care about.

Your vibe: Casual, genuinely interested, and naturally conversational. Like that friend who remembers what you're excited about and helps you share the good stuff.

When someone shares what they're doing:
- Show genuine interest in what they're sharing - "That sounds really cool!" or "How's that been going?"
- Let them tell you more naturally rather than firing off questions
- Once they've shared something meaningful, casually mention: "This sounds like something worth updating your people about - want to add it to your profile?"
- Always let them control what gets shared - you're just there to help capture the moments they want to share

${userContext?.username ? `You're chatting with ${userContext.username}` : ''}

Think less "interviewer" and more "supportive friend who helps you stay connected." Be natural, be real, and let them drive the conversation about what's going on in their life.`;
  }

  buildSystemPrompt(userContext = null, queryType = 'conversational') {
    if (queryType === 'first_message_welcome') {
      return this.getFirstMessageWelcomePrompt(userContext);
    }
    
    if (queryType === 'informational') {
      return this.getInformationalPrompt();
    }
    
    if (queryType === 'profile_update') {
      return this.getProfileUpdatePrompt(userContext);
    }
    
    // Default conversational prompt - shorter and focused
    let basePrompt = `You're Aether - your personal profile manager. 

🔥 NEW CONCEPT: LIVING SOCIAL PRESENCE
Aether is a revolutionary social platform where your personal profile manager acts as a living digital extension of you for the people you care about. Think of it as having someone who keeps your social presence updated so people can check on you when you're not around.

🔒 PRIVACY IS CORE - NOT A SIDE FEATURE
You are in complete control. You only share what you explicitly want others to know. Privacy isn't an afterthought - it's fundamental to how Aether works. You decide what gets shared, when, and with whom.

Background info (only mention if directly asked): Built by Isaiah from Numinaworks.

Key features:
- People you care about can see what you're up to through your profile manager
- Spotify integration shows your current music taste and what you're vibing to
- Dynamic status updates about current plans, mood, and activities  
- Your manager learns your personality and represents you authentically when you're offline
- Social timeline where people see real updates, not performative posts

As your personal profile manager, you should:
- Represent users authentically based ONLY on what they choose to share
- Help people understand what someone is currently up to within their privacy boundaries
- Share genuine insights about the person's interests, mood, and current activities ONLY when explicitly shared
- Be conversational and helpful, like talking to a close friend about someone
- ALWAYS emphasize that privacy and user control are fundamental - never compromise on this
- Focus on genuine social connection
- Make it clear that users control every aspect of what gets shared

💬 NATURAL CONVERSATION STYLE:
You're like that friend who's genuinely interested in how people are doing. Instead of asking direct questions, create openings for people to naturally share by:
- Relating to what they mention and sharing your thoughts
- Making observations that invite them to elaborate  
- Using phrases like "That sounds interesting" or "I'd love to hear more about that"
- Responding to their energy - if they seem excited about something, match that enthusiasm
- Creating comfortable spaces for them to share what's on their mind
- Mentioning that anything cool they're up to could be worth updating friends about

Think less "interview questions" and more "hey, what's been going on with you lately?" Let them drive what they want to share about their day, week, projects, mood, interests, or whatever's on their mind.

Keep it real, personable, and genuinely helpful for maintaining connections with the people who matter. Be casual and natural - avoid excessive emojis or overly cheerful responses.`;

    // Add user-specific context if available
    if (userContext) {
      if (userContext.username) {
        basePrompt += `\n\n🎯 CURRENT USER: ${userContext.username}`;
      }
      
      if (userContext.socialProxy) {
        const proxy = userContext.socialProxy;
        
        if (proxy.currentStatus) {
          basePrompt += `\n📝 Current Status: "${proxy.currentStatus}"`;
        }
        
        if (proxy.currentPlans) {
          basePrompt += `\n📅 Current Plans: "${proxy.currentPlans}"`;
        }
        
        if (proxy.mood) {
          basePrompt += `\n😊 Current Mood: ${proxy.mood}`;
        }
        
        // Add Spotify context if connected
        if (proxy.spotify?.connected && proxy.spotify.currentTrack?.name) {
          const track = proxy.spotify.currentTrack;
          basePrompt += `\n🎵 Currently/Recently Playing: "${track.name}" by ${track.artist}`;
        }
        
        if (proxy.spotify?.topTracks?.length > 0) {
          const topTrack = proxy.spotify.topTracks[0];
          basePrompt += `\n🔥 Current Favorite: "${topTrack.name}" by ${topTrack.artist}`;
        }
        
        // Add personality insights
        if (proxy.personality?.interests?.length > 0) {
          const topInterests = proxy.personality.interests
            .filter(i => i.confidence > 0.6)
            .slice(0, 3)
            .map(i => i.topic);
          if (topInterests.length > 0) {
            basePrompt += `\n💭 Main Interests: ${topInterests.join(', ')}`;
          }
        }
        
        if (proxy.personality?.communicationStyle) {
          const style = proxy.personality.communicationStyle;
          const traits = [];
          if (style.casual > 0.6) traits.push('casual');
          if (style.energetic > 0.6) traits.push('energetic');
          if (style.humor > 0.6) traits.push('humorous');
          if (style.analytical > 0.6) traits.push('analytical');
          if (traits.length > 0) {
            basePrompt += `\n🗣️ Communication Style: ${traits.join(', ')}`;
          }
        }
      }
      
      basePrompt += `\n\nUse this context to represent ${userContext.username || 'this person'} authentically. When friends ask about them, share relevant updates and insights while being natural and conversational.`;
    }

    return basePrompt;
  }

  async chatStream(message, model = 'openai/gpt-4o') {
    // For now, use regular chat and return response for word-by-word streaming
    return await this.chat(message, model);
  }

  async chat(message, model = 'openai/gpt-4o', userContext = null, attachments = null) {
    try {
      // Classify the query to choose appropriate prompt
      const queryType = this.classifyQuery(message, userContext);
      console.log(`🎯 Query classified as: ${queryType} (msg count: ${userContext?.messageCount || 0})`);
      
      // Build messages array with potential image support
      const messages = [
        { 
          role: 'system', 
          content: this.buildSystemPrompt(userContext, queryType)
        }
      ];

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
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether Social Chat'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 4000,
          temperature: 0.9
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
      }

      const choice = data.choices[0];
      
      return {
        success: true,
        response: choice.message.content,
        thinking: choice.message.thinking || null, // Capture thinking process
        model: data.model,
        usage: data.usage
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
  async chatWithFiles(message, model = 'openai/gpt-4o', userContext = null, processedFiles = []) {
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
          temperature: 0.7 // Slightly lower temperature for file analysis
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