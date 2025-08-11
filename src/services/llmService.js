/**
 * LLM Service - OpenRouter Integration
 * Provides a unified interface for LLM requests with streaming support
 */

import fetch from 'node-fetch';
import { env } from '../config/environment.js';

class LLMService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async makeLLMRequest(messages, options = {}) {
    try {
      const {
        model = 'openai/gpt-5',
        temperature = 0.9,
        n_predict = 4000,
        tools = [],
        tool_choice = undefined,
        musicDiscoveryContext = null
      } = options;

      // Enhance messages with music discovery context
      let enhancedMessages = messages;
      if (musicDiscoveryContext) {
        enhancedMessages = this.enhanceMessagesWithMusicContext(messages, musicDiscoveryContext);
      }

      const requestBody = {
        model,
        messages: enhancedMessages,
        max_tokens: n_predict,
        temperature,
        stream: false
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
        if (tool_choice) {
          requestBody.tool_choice = tool_choice;
        }
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether AI'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          data,
          url: this.baseUrl,
          model: requestBody.model
        };
        console.error('🚨 OpenRouter API Error Details:', errorDetails);
        throw new Error(`OpenRouter API error (${response.status}): ${data.error?.message || response.statusText}`);
      }

      const choice = data.choices[0];
      
      return {
        content: choice.message.content,
        tool_calls: choice.message.tool_calls || [],
        model: data.model,
        usage: data.usage
      };
    } catch (error) {
      console.error('LLM Service Error:', error);
      throw error;
    }
  }

  async makeStreamingRequest(messages, options = {}) {
    try {
      const {
        model = 'openai/gpt-5',
        temperature = 0.9,
        n_predict = 4000,
        tools = [],
        tool_choice = undefined
      } = options;

      const requestBody = {
        model,
        messages,
        max_tokens: n_predict,
        temperature,
        stream: true
      };

      if (tools.length > 0) {
        requestBody.tools = tools;
        if (tool_choice) {
          requestBody.tool_choice = tool_choice;
        }
      }

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether AI'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenRouter API error: ${errorData.error?.message || response.statusText}`);
      }

      return response.body;
    } catch (error) {
      console.error('LLM Streaming Service Error:', error);
      throw error;
    }
  }

  /**
   * Generate a simple text completion
   * @param {Object} options - Generation options
   * @param {string} options.prompt - The prompt to complete
   * @param {string} options.model - Model to use
   * @param {number} options.maxTokens - Max tokens to generate
   * @param {number} options.temperature - Temperature for generation
   * @returns {Object} Completion result
   */
  async generateCompletion(options = {}) {
    try {
      const {
        prompt,
        model = 'openai/gpt-5-mini',
        maxTokens = 500,
        temperature = 0.7
      } = options;

      if (!prompt) {
        throw new Error('Prompt is required for completion');
      }

      const messages = [
        { role: 'user', content: prompt }
      ];

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether Profile Analysis'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream: false
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          data,
          url: this.baseUrl,
          model: requestBody.model
        };
        console.error('🚨 OpenRouter API Error Details:', errorDetails);
        throw new Error(`OpenRouter API error (${response.status}): ${data.error?.message || response.statusText}`);
      }

      const choice = data.choices[0];
      
      return {
        success: true,
        completion: choice.message.content,
        model: data.model,
        usage: data.usage
      };
    } catch (error) {
      console.error('LLM generateCompletion Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate conversation title from first message
   * Uses ultra-cheap Llama 3.1 8B for cost efficiency (~$0.18/1M tokens)
   * @param {string} firstMessage - The first user message
   * @returns {Object} Title generation result
   */
  async generateConversationTitle(firstMessage) {
    try {
      if (!firstMessage || firstMessage.trim().length < 10) {
        return {
          success: true,
          title: this.createFallbackTitle(firstMessage || 'New Chat')
        };
      }

      // Truncate very long messages to keep costs down
      const truncatedMessage = firstMessage.length > 200 
        ? firstMessage.substring(0, 200) + '...' 
        : firstMessage;

      const prompt = `Create a concise 2-5 word title for this conversation starter. No quotes, no punctuation at the end:

"${truncatedMessage}"

Title:`;

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether Title Generation'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct', // Ultra cheap at ~$0.18/1M tokens
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 20,
          temperature: 0.3,
          stop: ['\n', '.', '!', '?'] // Stop at natural ending points
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.warn('Title generation API error, using fallback:', data.error?.message);
        return {
          success: true,
          title: this.createFallbackTitle(firstMessage),
          fallback: true
        };
      }

      const generatedTitle = data.choices[0]?.message?.content?.trim();
      
      if (!generatedTitle) {
        return {
          success: true,
          title: this.createFallbackTitle(firstMessage),
          fallback: true
        };
      }

      // Clean up the generated title
      const cleanTitle = this.cleanGeneratedTitle(generatedTitle);
      
      // Log cost for monitoring (ultra cheap - basically free)
      if (data.usage) {
        const costEstimate = (data.usage.total_tokens * 0.00000018).toFixed(6);
        console.log(`💰 Title generation: ${data.usage.total_tokens} tokens (~$${costEstimate})`);
      }

      return {
        success: true,
        title: cleanTitle,
        model: data.model,
        usage: data.usage
      };

    } catch (error) {
      console.error('Title generation error:', error);
      return {
        success: true,
        title: this.createFallbackTitle(firstMessage),
        fallback: true,
        error: error.message
      };
    }
  }

  /**
   * Clean and validate generated titles
   */
  cleanGeneratedTitle(title) {
    // Remove quotes, extra punctuation, and normalize
    let cleaned = title
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .replace(/[.!?]+$/, '') // Remove trailing punctuation
      .trim();

    // Ensure reasonable length (2-40 characters)
    if (cleaned.length < 2) {
      return 'New Chat';
    }
    
    if (cleaned.length > 40) {
      cleaned = cleaned.substring(0, 37) + '...';
    }

    // Capitalize first letter
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  /**
   * Create fallback title from the original message
   */
  createFallbackTitle(message) {
    if (message.length <= 40) {
      return message.charAt(0).toUpperCase() + message.slice(1);
    }
    
    // Take first few words up to 40 characters
    const words = message.split(' ');
    let title = '';
    
    for (const word of words) {
      if ((title + ' ' + word).length > 37) break;
      title += (title ? ' ' : '') + word;
    }
    
    return title + '...';
  }

  /**
   * Enhance messages with music discovery context
   */
  enhanceMessagesWithMusicContext(messages, musicContext) {
    if (!musicContext || messages.length === 0) return messages;

    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage.role !== 'user') return messages;

    let contextPrompt = '';
    
    if (musicContext.recommendationType === 'main_genres') {
      contextPrompt = `MUSIC DISCOVERY CONTEXT: User is new to our platform or has limited music preferences. 
Present them with a choice between exploring main music genres (Rock, Pop, Hip-Hop, Electronic, Jazz, Country, Classical, Indie, Folk, R&B) or answer their question first and then suggest they can build a custom preference list over time as you learn their taste.

Response should offer:
1. Direct answer to their question
2. Choice: "Would you like me to show you music by main genres, or would you prefer I learn your taste over time for personalized recommendations?"
3. Briefly explain that the platform learns preferences to provide better recommendations`;

    } else if (musicContext.recommendationType === 'custom_list') {
      contextPrompt = `MUSIC DISCOVERY CONTEXT: User has established music preferences on the platform.
User's current preferences: ${musicContext.userContext}

Response should:
1. Use their established preferences to give personalized recommendations
2. Reference their known tastes: "${musicContext.userContext}"
3. Suggest new music that builds on their existing preferences
4. Mention how their preference data helps provide better recommendations`;
    }

    // Create enhanced messages array
    const enhancedMessages = [...messages];
    
    // Add context to the last user message
    enhancedMessages[enhancedMessages.length - 1] = {
      ...lastUserMessage,
      content: `${contextPrompt}

USER MESSAGE: ${lastUserMessage.content}`
    };

    return enhancedMessages;
  }
}

export function createLLMService() {
  return new LLMService();
}

export default new LLMService();