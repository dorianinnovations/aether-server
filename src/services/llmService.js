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
        tool_choice = undefined
      } = options;

      const requestBody = {
        model,
        messages,
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
}

export function createLLMService() {
  return new LLMService();
}

export default new LLMService();