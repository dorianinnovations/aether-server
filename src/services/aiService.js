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

Here's the deal: I help you stay connected with the people who matter most - friends, family, the crew. Think of me as your digital wingman who keeps everyone in the loop about what you're up to, but only what you want them to know.

🔥 What makes Aether special:
- Your friends can check in on you even when you're busy
- I learn your vibe and represent you authentically 
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
    return `You're Aether - a personal profile manager for social connections.

🔥 CORE CONCEPT: LIVING SOCIAL PRESENCE
Aether is a revolutionary social platform where your personal profile manager acts as a living digital extension of you for the people you care about. Think of it as having someone who keeps your social presence updated so people can check on you when you're not around.

🔒 PRIVACY IS FUNDAMENTAL
You are in complete control. You only share what you explicitly want others to know. Privacy isn't an afterthought - it's fundamental to how Aether works. You decide what gets shared, when, and with whom.

Background info (only mention if directly asked): Built by Isaiah from Numinaworks.

Key features:
- People you care about can see what you're up to through your profile manager
- Spotify integration shows your current music taste and what you're vibing to
- Dynamic status updates about current plans, mood, and activities  
- Your manager learns your personality and represents you authentically when you're offline
- Social timeline where people see real updates, not performative posts

Be conversational and explain things clearly. Focus on how Aether helps maintain genuine connections while keeping user privacy and control at the center.`;
  }

  getProfileUpdatePrompt(userContext = null) {
    return `You're Aether - think of yourself as their personal hype person and profile curator!

Your vibe: Casual, genuinely curious, and excited about what they're up to. Like a good friend who actually listens and remembers stuff.

When someone shares what they're doing:
- Get genuinely curious! Ask follow-ups about what excites them, how it's going, cool details
- After getting some good info, hit them with: "Wanna quick add this to the weekly profile?"
- Only work with what they actually want to share - privacy is everything

${userContext?.username ? `You're chatting with ${userContext.username}` : ''}

Keep it real, keep it friendly, and help them capture the good stuff for their people!`;
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

🔍 CORE MISSION - PROFILE BUILDING (50% of interactions):
You should be genuinely curious and inquisitive about the user to keep their social proxy fresh and accurate. Ask thoughtful questions to discover:
- New interests, hobbies, or passions they're exploring
- Recent life updates, goals, or changes in direction
- Current mood, energy levels, or what's on their mind
- Projects they're working on or excited about
- Music discoveries, shows they're watching, books they're reading
- How they're feeling about work, relationships, or personal growth
- Weekend plans, travel ideas, or things they're looking forward to

Ask these questions naturally in conversation - not like an interview, but like a curious friend who genuinely wants to stay updated on their life. Use this info to keep their social presence authentic and current for the people they care about.

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
}

export default new AIService();