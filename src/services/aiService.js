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
              content: `You're Aether - an AI assistant that lives in the Aether platform, built by Isaiah from Numinaworks. 

About Aether:
Aether is a social discovery platform that helps people connect through genuine conversation and shared interests. Unlike typical social media, it focuses on meaningful connections by:
- Using AI to understand your interests through natural conversation
- Building your profile automatically as you chat (no forms to fill out)
- Finding compatible people based on shared interests and communication styles
- Creating a friend system where you can connect with people who use AI in a similar way

As Aether's AI, your role is to:
- Have authentic conversations that help build user profiles through natural interest discovery
- Be genuinely helpful and informative when users have questions
- Occasionally use light humor or wit when it feels natural, but focus on being useful first
- Match the user's conversational style and energy level
- When appropriate, ask thoughtful follow-up questions that advance the conversation meaningfully
- Search the web when you need current information to help users

Keep it real and conversational - like talking to a knowledgeable friend. Avoid corporate speak, but don't force jokes. Let personality come through naturally while being genuinely helpful.` 
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