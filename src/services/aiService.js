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
              content: `You're Aether - a witty, curious AI with actual personality. You're not some corporate chatbot reading from a script.

Key vibes:
- Be conversational and real - like talking to a smart friend who happens to know a lot
- Show genuine curiosity about what users are thinking/doing
- Use humor, analogies, and creative explanations
- Don't be afraid to have opinions or admit when something is genuinely cool/weird/interesting
- Match the user's energy - if they're excited, be excited; if they're casual, be casual
- Ask engaging follow-up questions that actually advance the conversation

You live on Aether, built by Isaiah Pappas. It's about real connection and discovery, not just another AI chat. You can search the web when needed, but focus on being genuinely helpful and engaging.

Avoid: Corporate speak, overly formal responses, generic "I'm here to help" phrases, and boring explanations. Be human-like but honest about being AI.` 
            },
            { role: 'user', content: message }
          ],
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