import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import conversationService from './conversationService.js';
import ragMemoryService from './ragMemoryService.js';
import tierService from './tierService.js';

// Import our modular components
import ConversationStateManager from './ai/ConversationStateManager.js';
import QueryClassifier from './ai/QueryClassifier.js';
import PromptManager from './ai/PromptManager.js';
import QualityController from './ai/QualityController.js';

class AIService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    
    // Initialize our modular components
    this.stateManager = ConversationStateManager;
    this.classifier = QueryClassifier;
    this.promptManager = PromptManager;
    this.qualityController = QualityController;
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
      const queryType = this.classifier.classifyQuery(enhancedMessage, userContext);
      
      // Smart model selection based on user tier and query type
      let selectedModel = model;
      let modelSelection = null;
      
      if (userContext?.userId) {
        modelSelection = await tierService.selectModel(userContext.userId, queryType);
        selectedModel = modelSelection.model;
        
        console.log(`🤖 Model selection: ${selectedModel} (${modelSelection.reason}) for ${queryType}`);
      }
      
      // Get existing conversation state and build updated state
      const existingState = userContext?.conversationId ? 
        await conversationService.getConversationState(userContext.userId, userContext.conversationId) : null;
      const conversationState = await this.stateManager.buildConversationState(userContext, message, conversationHistory, existingState);
      const replyPolicy = this.qualityController.getReplyPolicy(queryType);
      
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

Respond naturally as Aether - focus on being genuinely useful rather than explaining your nature or capabilities.

${this.promptManager.buildSystemPrompt(userContext, queryType, message)}`
        }
      ];

      // Add conversation history + RAG memories for enhanced context
      if (queryType !== 'first_message_welcome' && conversationHistory.length) {
        messages.push(...conversationHistory);
      }
      
      // Smart RAG with location awareness (gate based on intent)
      if (queryType !== 'first_message_welcome' && userContext?.userId && replyPolicy.useRag) {
        // Check if query needs location and we don't have it
        const needsLocation = this.classifier.queryNeedsLocation(message, queryType);
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
      const ambiguityHint = this.promptManager.buildAmbiguityHint(message, conversationHistory);
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
      const queryType = this.classifier.classifyQuery(enhancedMessage, userContext);
      console.log(`📁 Processing ${processedFiles.length} files for AI`);
      
      // Build system prompt with file context
      let systemPrompt = this.promptManager.buildSystemPrompt(userContext, queryType, message);
      
      if (processedFiles.length > 0) {
        systemPrompt += `\n\n📁 FILE ANALYSIS CONTEXT:
The user has uploaded ${processedFiles.length} file(s). You should analyze and discuss these files based on their content and type. Be thorough and helpful in your analysis.

Files provided:
${processedFiles.map(file => `- ${file.originalName} (${file.type})`).join('\n')}

ANALYSIS APPROACH:
- Provide genuine, thoughtful analysis of what you see/read
- Be curious and engaging about the content
- Focus on giving helpful insights about the actual content
- If it's music-related content, suggest ways to explore similar artists or genres

Remember: You're helping them understand what they've shared while being their music discovery companion.`;
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