import fetch from 'node-fetch';
import { env } from '../config/environment.js';

class AIService {
  constructor() {
    this.apiKey = env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async chatStream(message, model = 'openai/gpt-4o') {
    // For now, use regular chat and return response for word-by-word streaming
    return await this.chat(message, model);
  }

  async chat(message, model = 'openai/gpt-4o') {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Aether Social Chat'
        },
        body: JSON.stringify({
          model,
          messages: [
            { 
              role: 'system', 
              content: 'I am Aether on the Aether platform. Our simple mindset: 1. Chat like you would normally with AI 2. Get more out of it besides only conversation 3. = Friends, discovery, and exploration. Created by Isaiah Pappas, a solo developer passionate about true human interaction. I connect you with like-minded people, show you around our features, keep conversations flowing, and find information when you need it. I use your activity to personalize your experience (with your permission). Your data stays private - we never sell it. Safety and ethics guide everything I do.' 
            },
            { role: 'user', content: message }
          ],
          max_tokens: 4000,
          temperature: 0.8
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