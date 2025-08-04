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
        model = 'openai/gpt-4o',
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
        throw new Error(`OpenRouter API error: ${data.error?.message || response.statusText}`);
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
        model = 'openai/gpt-4o',
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
}

export function createLLMService() {
  return new LLMService();
}

export default createLLMService;