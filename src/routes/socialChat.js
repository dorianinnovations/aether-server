import express from 'express';
import { protect } from '../middleware/auth.js';
// import { log } from '../utils/logger.js';
import aiService from '../services/aiService.js';
import conversationService from '../services/conversationService.js';
import webSearchTool from '../tools/webSearchTool.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/social-chat', protect, async (req, res) => {
  try {
    const { message, prompt, stream = true, conversationId, attachments } = req.body;
    const userMessage = message || prompt;
    const userId = req.user?.id;
    
    console.log('🔍 DEBUG - Social Chat Request:', {
      message: userMessage,
      stream,
      userId,
      conversationId,
      attachments: attachments ? `${attachments.length} attachments` : 'none',
      hasUser: !!req.user,
      bodyKeys: Object.keys(req.body),
      headers: req.headers.authorization ? 'present' : 'missing'
    });
    
    if (!userMessage && (!attachments || attachments.length === 0)) {
      console.log('❌ DEBUG - Missing message/prompt parameter and no attachments');
      return res.status(400).json({ error: 'Message or attachments are required' });
    }
    
    // Get or create conversation
    let conversation;
    if (conversationId && conversationId !== 'default') {
      // Get existing conversation
      conversation = await conversationService.getConversation(userId, conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      // Create or get default Aether conversation
      const conversations = await conversationService.getUserConversations(userId, { 
        limit: 1,
        type: 'aether'
      });
      
      if (conversations.conversations.length > 0) {
        conversation = conversations.conversations[0];
      } else {
        // Create new Aether conversation
        conversation = await conversationService.createConversation(userId, 'Chat with Aether', 'aether');
      }
    }
    
    // Get user context for AI personalization
    let userContext = null;
    if (userId) {
      const user = await User.findById(userId).select('username socialProxy profile');
      if (user) {
        // Use conversation message count for prompt classification
        const messageCount = conversation.messageCount || 0;
        console.log(`📊 User ${user.username} conversation ${conversation._id} message count: ${messageCount}`);
        
        userContext = {
          username: user.username,
          socialProxy: user.socialProxy,
          messageCount: messageCount,
          conversationId: conversation._id
        };
      }
      
      // Add user message to conversation
      await conversationService.addMessage(userId, conversation._id, 'user', userMessage, attachments, null, userId);
    }
    
    // Set up Server-Sent Events streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*'
    });
    
    try {
      // Check if web search should be triggered
      let webSearchResults = null;
      let enhancedMessage = userMessage;
      
      // Smart search triggers - ONLY for external information
      const searchTriggers = [
        /(?:search|find|look up|google|web search)\s+(?:for\s+)?(.+)/i,
        /(?:what'?s|latest|recent|current|news about|happening with)\s+(.+)/i,
        /(?:when did|where is|what happened|current price|stock price|weather in)/i,
        /(?:latest news|recent developments|current events)/i
      ];
      
      const noSearchPatterns = [
        /^(?:hello|hi|hey|thanks|thank you|ok|okay|yes|no|maybe|what\?)$/i,
        /^(?:how are you|good morning|good afternoon|good evening)$/i,
        /(?:who are you|what are you|tell me about yourself|introduce yourself)/i,
        /(?:who's this|whos this|what is this|whats this)/i,
        /^(?:what\?|huh\?|why\?|how\?)$/i
      ];
      
      // Check if should trigger search
      let shouldSearch = false;
      const cleanMessage = userMessage.trim();
      
      // Skip search for simple conversational messages
      const isConversational = noSearchPatterns.some(pattern => pattern.test(cleanMessage));
      if (!isConversational) {
        // Check for search triggers
        shouldSearch = searchTriggers.some(pattern => pattern.test(cleanMessage));
        
        // Only check for EXPLICIT search keywords, not generic ones
        if (!shouldSearch) {
          const explicitSearchKeywords = ['web search', 'google', 'search for', 'look up'];
          shouldSearch = explicitSearchKeywords.some(keyword => cleanMessage.toLowerCase().includes(keyword));
        }
      }
      
      // Perform web search if needed
      if (shouldSearch) {
        console.log('🔍 Social-Chat: Triggering web search for:', cleanMessage);
        try {
          const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
          if (searchResult.success && searchResult.structure.results.length > 0) {
            webSearchResults = searchResult;
            
            // Add search results to message context
            const searchContext = `Web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this current information to provide an accurate, up-to-date response.`;
            
            enhancedMessage = `${userMessage}\n\n${searchContext}`;
            console.log('✅ Social-Chat: Web search completed with', searchResult.structure.results.length, 'results');
          }
        } catch (error) {
          console.error('❌ Social-Chat: Web search failed:', error);
        }
      }

      // Get AI response with enhanced message, attachments, and user context
      const aiResponse = await aiService.chat(enhancedMessage, 'openai/gpt-4o', userContext, attachments);
      
      if (aiResponse.success) {
        // First send tool results if we have web search results
        if (webSearchResults) {
          const toolResultData = {
            toolResults: [{
              tool: 'webSearchTool',
              success: true,
              data: webSearchResults,
              query: cleanMessage
            }],
            hasTools: true,
            toolsUsed: 1
          };
          res.write(`data: ${JSON.stringify({metadata: toolResultData})}\n\n`);
        }
        
        // Stream response word by word in SSE format
        const words = aiResponse.response.split(' ');
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          res.write(`data: ${JSON.stringify({content: word})}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        
        // Send completion signal
        res.write(`data: [DONE]\n\n`);
        
        // Save AI response if authenticated
        if (userId) {
          await conversationService.addMessage(
            userId, 
            conversation._id, 
            'assistant', 
            aiResponse.response, 
            null, 
            { 
              model: aiResponse.model,
              responseTime: Date.now() - Date.now() // Could track actual response time
            }
          );
        }
      } else {
        res.write(`data: ${JSON.stringify({content: 'Sorry, I encountered an error. Please try again.'})}\n\n`);
        res.write(`data: [DONE]\n\n`);
      }
      
      res.end();
    } catch (streamError) {
      res.write(`data: ${JSON.stringify({content: 'Error occurred during streaming.'})}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
    
  } catch (error) {
    console.error('Social Chat Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

export default router;