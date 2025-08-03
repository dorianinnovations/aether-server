/**
 * AI Routes - Simplified Chat Functionality
 * Essential features only: chat, basic memory, file uploads
 */

import express from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.js';
import { checkTierLimits } from '../middleware/tierLimiter.js';
import { createLLMService } from '../services/llmService.js';
import conversationService from '../services/conversationService.js';
import webSearchTool from '../tools/webSearchTool.js';

const router = express.Router();
const llmService = createLLMService();

// Configure multer for file uploads
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 5, // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'application/json', 'text/markdown'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not supported`), false);
    }
  }
});

// Main chat endpoint
router.post('/chat', protect, checkTierLimits, fileUpload.any(), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      message, 
      prompt, 
      stream = true,
      conversationId = 'default'
    } = req.body;
    
    const userMessage = message || prompt;
    const userId = req.user.id;
    const userTier = req.user.subscription?.plan || 'core';
    
    if (!userMessage) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Get recent conversation context (simple RAG-like memory)
    let conversationContext = [];
    try {
      const recentMessages = await conversationService.getRecentMessages(userId, conversationId, 10);
      conversationContext = recentMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    } catch (error) {
      console.warn('Could not load conversation context:', error.message);
    }

    // Build simple system prompt
    let systemPrompt = `You are Aether, an AI assistant on the Aether platform. You are helpful, intelligent, and engaging. 
You have access to the user's recent conversation history to maintain context.
Keep responses conversational and natural.`;

    // Process uploaded files
    let fileContent = '';
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        if (file.mimetype.startsWith('image/')) {
          const base64 = file.buffer.toString('base64');
          fileContent += `\n[Image: ${file.originalname} uploaded]`;
        } else if (file.mimetype.startsWith('text/')) {
          const textData = file.buffer.toString('utf8');
          fileContent += `\n[File: ${file.originalname}]\n${textData}\n`;
        }
      }
    }

    const finalMessage = userMessage + fileContent;

    // Check if web search should be triggered
    let webSearchResults = null;
    let toolResults = [];
    
    // Define search patterns (simplified version from webSearchTool)
    const searchTriggers = [
      /(?:search|find|look up|google|bing)\s+(?:for\s+)?(.+)/i,
      /(?:what'?s|latest|recent|current|news about|happening with)\s+(.+)/i,
      /(?:when|where|who|what|how|why)\s+(?:is|are|was|were|did|does|do)\s+(.+)/i,
      /(?:what is|define|meaning of|explain)\s+(.+)/i,
      /(?:statistics|data|numbers|facts about)\s+(.+)/i,
      /(?:compare|difference between|vs|versus)\s+(.+)/i
    ];
    
    const noSearchPatterns = [
      /^(?:hello|hi|hey|thanks|thank you|ok|okay|yes|no|maybe)$/i,
      /^(?:how are you|good morning|good afternoon|good evening)$/i,
      /^(?:i think|i feel|i believe|in my opinion).*$/i,
      /^(?:can you help|could you|would you|please).*(?:with|me).*$/i
    ];
    
    // Check if should trigger search
    let shouldSearch = false;
    const forceSearch = userMessage.includes('[FORCE_SEARCH]');
    const cleanMessage = userMessage.replace('[FORCE_SEARCH]', '').trim();
    
    if (forceSearch) {
      shouldSearch = true;
    } else {
      // Skip search for conversational messages
      const isConversational = noSearchPatterns.some(pattern => pattern.test(cleanMessage));
      if (!isConversational) {
        // Check for search triggers
        shouldSearch = searchTriggers.some(pattern => pattern.test(cleanMessage));
        
        // Also check for search keywords
        if (!shouldSearch) {
          const searchKeywords = ['current', 'latest', 'recent', 'news', 'update', 'today', 'now', 'price', 'cost', 'statistics', 'data', 'facts'];
          shouldSearch = searchKeywords.some(keyword => cleanMessage.toLowerCase().includes(keyword));
        }
      }
    }
    
    // Perform web search if needed
    if (shouldSearch) {
      console.log('🔍 Triggering web search for:', cleanMessage);
      try {
        const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
        if (searchResult.success) {
          webSearchResults = searchResult;
          toolResults.push({
            tool: 'webSearchTool',
            success: true,
            data: searchResult,
            query: cleanMessage,
            processingTime: Date.now() - Date.now()
          });
          
          // Add search results to system prompt
          const searchContext = `Recent web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this information to provide current, accurate responses.`;
          
          systemPrompt = systemPrompt + '\n\n' + searchContext;
        }
      } catch (error) {
        console.error('Web search failed:', error);
        toolResults.push({
          tool: 'webSearchTool',
          success: false,
          error: error.message,
          query: cleanMessage
        });
      }
    }

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationContext.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: finalMessage }
    ];

    // Handle streaming vs non-streaming
    if (stream) {
      return await handleStreaming(res, messages, userMessage, userId, conversationId, userTier, toolResults);
    } else {
      return await handleNonStreaming(res, messages, userMessage, userId, conversationId, userTier, toolResults);
    }

  } catch (error) {
    console.error('Chat error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message || 'Chat processing failed'
      });
    }
  } finally {
    // Cleanup uploaded file buffers
    if (req.files) {
      req.files.forEach(file => {
        if (file.buffer) file.buffer = null;
      });
    }
  }
});

async function handleStreaming(res, messages, userMessage, userId, conversationId, userTier, toolResults = []) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  try {
    const maxTokens = userTier === 'aether' ? 4000 : 2000;
    const streamResponse = await llmService.makeStreamingRequest(messages, {
      n_predict: maxTokens,
      temperature: 0.8
    });

    let accumulatedContent = '';

    streamResponse.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            if (!data || data.trim() === '') continue;
            
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            
            if (choice?.delta?.content) {
              const content = choice.delta.content;
              accumulatedContent += content;
              
              res.write(`data: ${JSON.stringify({ 
                content: content,
                tier: userTier
              })}\n\n`);
            }
          } catch (error) {
            // Skip malformed chunks
            continue;
          }
        }
      }
    });

    streamResponse.on('end', async () => {
      try {
        // Save conversation
        await conversationService.addMessage(userId, conversationId, 'user', userMessage);
        await conversationService.addMessage(userId, conversationId, 'assistant', accumulatedContent);
      } catch (saveError) {
        console.error('Save error:', saveError.message);
      }
      
      res.write('data: [DONE]\n\n');
      res.end();
    });

    streamResponse.on('error', (err) => {
      console.error('Streaming error:', err);
      res.write('data: [DONE]\n\n');
      res.end();
    });

  } catch (error) {
    console.error('Streaming setup error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Streaming failed' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

async function handleNonStreaming(res, messages, userMessage, userId, conversationId, userTier, toolResults = []) {
  try {
    const maxTokens = userTier === 'aether' ? 4000 : 2000;
    const response = await llmService.makeLLMRequest(messages, {
      n_predict: maxTokens,
      temperature: 0.8
    });

    const assistantResponse = response.content || 'Sorry, I could not generate a response.';

    // Save conversation
    try {
      if (conversationService.addMessage) {
        await conversationService.addMessage(userId, conversationId, 'user', userMessage);
        await conversationService.addMessage(userId, conversationId, 'assistant', assistantResponse);
      }
    } catch (saveError) {
      console.error('Save error:', saveError.message);
    }

    return res.json({
      success: true,
      data: {
        response: assistantResponse,
        toolResults: toolResults,
        hasTools: toolResults.length > 0,
        toolsUsed: toolResults.length
      },
      content: assistantResponse,  // Keep for backward compatibility
      tier: userTier,
      model: response.model
    });

  } catch (error) {
    console.error('Non-streaming error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Legacy endpoint compatibility
router.post('/adaptive-chat', (req, res, next) => {
  // Redirect to main chat endpoint
  req.url = '/chat';
  return router.handle(req, res, next);
});

export default router;