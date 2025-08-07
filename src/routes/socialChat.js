import express from 'express';
import { protect } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import aiService from '../services/aiService.js';
import conversationService from '../services/conversationService.js';
import webSearchTool from '../tools/webSearchTool.js';
import User from '../models/User.js';
import { uploadFiles, handleMulterError, validateUploadedFiles } from '../middleware/fileUpload.js';
import fileProcessingService from '../services/fileProcessingService.js';
import fileValidationService from '../services/fileValidationService.js';
import analysisQueue from '../services/analysisQueue.js';

const router = express.Router();

// Regular chat endpoint without files
router.post('/social-chat', protect, async (req, res) => {
  const startTime = Date.now();
  const correlationId = log.request.start('POST', '/social-chat', { userId: req.user?.id });
  
  try {
    const { message, prompt, stream = true, conversationId, attachments } = req.body;
    const userMessage = message || prompt;
    const userId = req.user?.id;
    
    log.debug('Social chat request details', {
      correlationId,
      messageLength: userMessage?.length || 0,
      stream,
      conversationId,
      attachmentCount: attachments?.length || 0,
      userId
    });
    
    if (!userMessage && (!attachments || attachments.length === 0)) {
      log.warn('Social chat rejected - no content', { correlationId });
      return res.status(400).json({ error: 'Message or attachments are required' });
    }
    
    // Handle blank/contextless messages with attachments
    let processedMessage = userMessage;
    if ((!userMessage || userMessage.trim() === '') && attachments && attachments.length > 0) {
      processedMessage = `I'd like you to analyze what I've shared with you. Please take a close look and tell me what you see, think, or find interesting about it. 

If this content reveals something compelling about my interests, hobbies, projects, or personality that might be worth sharing with friends and family through my Aether profile, feel free to mention that - but don't push it unless it's genuinely noteworthy or represents something I'm passionate about.

Just give me your honest thoughts on what I've sent.`;
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
      const user = await User.findById(userId).select('username socialProxy profile onboarding');
      if (user) {
        // Use conversation message count for prompt classification
        const messageCount = conversation.messageCount || 0;
        log.request.step(`Conversation loaded: ${messageCount} messages`, correlationId, { username: user.username, conversationId: conversation._id });
        
        userContext = {
          username: user.username,
          socialProxy: user.socialProxy,
          onboarding: user.onboarding,
          messageCount: messageCount,
          conversationId: conversation._id
        };
      }
      
      // Add user message to conversation
      await conversationService.addMessage(userId, conversation._id, 'user', processedMessage, attachments, null, userId);
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
      let enhancedMessage = processedMessage;
      
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
      const cleanMessage = processedMessage.trim();
      
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
        log.request.step('Web search triggered', correlationId, { query: cleanMessage.substring(0, 100) });
        try {
          const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
          if (searchResult.success && searchResult.structure.results.length > 0) {
            webSearchResults = searchResult;
            
            // Add search results to message context
            const searchContext = `Web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this current information to provide an accurate, up-to-date response.`;
            
            enhancedMessage = `${processedMessage}\n\n${searchContext}`;
            log.request.step('Web search completed', correlationId, { resultCount: searchResult.structure.results.length });
          }
        } catch (error) {
          log.error('Web search failed', error, { correlationId });
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

          // Queue user message for asynchronous profile analysis
          const analysisJobId = analysisQueue.enqueue(userId, processedMessage, {
            conversationId: conversation._id,
            timestamp: new Date(),
            source: 'social_chat'
          });
          
          log.debug(`📊 Profile analysis queued: ${analysisJobId}`, { userId, correlationId });

          // Auto-mark welcome as seen if this was a first message welcome response
          if (userContext?.messageCount === 0 && !userContext?.onboarding?.hasSeenWelcome) {
            try {
              await User.findByIdAndUpdate(userId, {
                $set: {
                  'onboarding.hasSeenWelcome': true,
                  'onboarding.welcomeShownAt': new Date()
                }
              });
              log.debug('🎯 Welcome prompt automatically marked as seen', { userId, correlationId });
            } catch (error) {
              log.error('Failed to auto-mark welcome as seen', error, { userId, correlationId });
            }
          }
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
    log.error('Social chat failed', error, { correlationId });
    log.request.complete(correlationId, 500, Date.now() - startTime);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  } finally {
    // Ensure successful requests are logged
    if (res.statusCode !== 500) {
      log.request.complete(correlationId, res.statusCode || 200, Date.now() - startTime);
    }
  }
});

// Enhanced chat endpoint with file upload support
router.post('/social-chat-with-files', protect, uploadFiles, validateUploadedFiles, handleMulterError, async (req, res) => {
  const startTime = Date.now();
  const correlationId = log.request.start('POST', '/social-chat-with-files', { userId: req.user?.id });
  
  try {
    const { message, prompt, stream = true, conversationId = 'default' } = req.body;
    const userMessage = message || prompt;
    const userId = req.user?.id;
    const uploadedFiles = req.validatedFiles || [];
    
    log.debug('Social chat with files request', {
      correlationId,
      messageLength: userMessage?.length || 0,
      stream,
      conversationId,
      fileCount: uploadedFiles.length,
      fileNames: uploadedFiles.map(f => f.originalname),
      userId
    });
    
    if (!userMessage && uploadedFiles.length === 0) {
      log.warn('Social chat with files rejected - no content', { correlationId });
      return res.status(400).json({ 
        success: false,
        error: 'Message or file attachments are required' 
      });
    }
    
    // Validate uploaded files
    let processedFiles = [];
    if (uploadedFiles.length > 0) {
      log.request.step(`File processing started: ${uploadedFiles.length} files`, correlationId);
      
      // Security validation
      const validationResult = await fileValidationService.validateFiles(uploadedFiles);
      if (!validationResult.valid) {
        log.error('File validation failed', null, { correlationId, errors: validationResult.errors });
        return res.status(400).json({
          success: false,
          error: 'File validation failed',
          details: validationResult.errors,
          warnings: validationResult.warnings
        });
      }
      
      // Process validated files
      try {
        processedFiles = await fileProcessingService.processFiles(validationResult.files);
        log.request.step(`Files processed successfully: ${processedFiles.length} files`, correlationId);
        
        // Log processing summary
        const summary = fileProcessingService.generateProcessingSummary(processedFiles);
        log.file('File processing completed', { correlationId, ...summary });
        
      } catch (processingError) {
        log.error('File processing failed', processingError, { correlationId });
        return res.status(500).json({
          success: false,
          error: 'File processing failed',
          message: processingError.message
        });
      }
    }
    
    // Get or create conversation
    let conversation;
    if (conversationId && conversationId !== 'default') {
      conversation = await conversationService.getConversation(userId, conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    } else {
      const conversations = await conversationService.getUserConversations(userId, { 
        limit: 1,
        type: 'aether'
      });
      
      if (conversations.conversations.length > 0) {
        conversation = conversations.conversations[0];
      } else {
        conversation = await conversationService.createConversation(userId, 'Chat with Aether', 'aether');
      }
    }
    
    // Get user context for AI personalization
    let userContext = null;
    if (userId) {
      const user = await User.findById(userId).select('username socialProxy profile onboarding');
      if (user) {
        const messageCount = conversation.messageCount || 0;
        log.request.step(`Conversation loaded: ${messageCount} messages`, correlationId, { username: user.username, conversationId: conversation._id });
        
        userContext = {
          username: user.username,
          socialProxy: user.socialProxy,
          onboarding: user.onboarding,
          messageCount: messageCount,
          conversationId: conversation._id
        };
      }
      
      // Add user message with file attachments to conversation
      const attachmentMetadata = processedFiles.map(file => ({
        originalName: file.originalName,
        type: file.type,
        size: file.size,
        mimeType: file.mimeType
      }));
      
      await conversationService.addMessage(
        userId, 
        conversation._id, 
        'user', 
        userMessage || '[File attachments sent]', 
        attachmentMetadata, 
        null, 
        userId
      );
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
      // Check if web search should be triggered (only if we have a text message)
      let webSearchResults = null;
      let enhancedMessage = userMessage || '';
      
      if (userMessage) {
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
          /(?:analyze|explain|describe|what do you see|what's in|tell me about).*(image|file|document|photo|picture)/i
        ];
        
        let shouldSearch = false;
        const cleanMessage = userMessage.trim();
        
        const isConversational = noSearchPatterns.some(pattern => pattern.test(cleanMessage));
        if (!isConversational && processedFiles.length === 0) { // Don't search when files are present
          shouldSearch = searchTriggers.some(pattern => pattern.test(cleanMessage));
          
          if (!shouldSearch) {
            const explicitSearchKeywords = ['web search', 'google', 'search for', 'look up'];
            shouldSearch = explicitSearchKeywords.some(keyword => cleanMessage.toLowerCase().includes(keyword));
          }
        }
        
        if (shouldSearch) {
          log.request.step('Web search triggered', correlationId, { query: cleanMessage.substring(0, 100) });
          try {
            const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
            if (searchResult.success && searchResult.structure.results.length > 0) {
              webSearchResults = searchResult;
              
              const searchContext = `Web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this current information to provide an accurate, up-to-date response.`;
              
              enhancedMessage = `${userMessage}\n\n${searchContext}`;
              log.request.step('Web search completed', correlationId, { resultCount: searchResult.structure.results.length });
            }
          } catch (error) {
            log.error('Web search failed', error, { correlationId });
          }
        }
      }

      // Prepare message for AI with file context
      let finalMessage = enhancedMessage;
      if (processedFiles.length > 0) {
        // Create a comprehensive default prompt for blank/contextless uploads
        const defaultAnalysisPrompt = userMessage && userMessage.trim() ? 
          enhancedMessage : 
          `I'd like you to analyze what I've shared with you. Please take a close look and tell me what you see, think, or find interesting about it. 

If this content reveals something compelling about my interests, hobbies, projects, or personality that might be worth sharing with friends and family through my Aether profile, feel free to mention that - but don't push it unless it's genuinely noteworthy or represents something I'm passionate about.

Just give me your honest thoughts on what I've sent.`;

        const fileContext = `\n\nFiles attached (${processedFiles.length}):\n` +
          processedFiles.map(file => `- ${file.originalName} (${file.type})`).join('\n');
        
        finalMessage = defaultAnalysisPrompt + fileContext;
      }

      // Get AI response with enhanced message, processed files, and user context
      const aiResponse = await aiService.chatWithFiles(finalMessage, 'openai/gpt-4o', userContext, processedFiles);
      
      if (aiResponse.success) {
        // Send tool results if we have web search results
        if (webSearchResults) {
          const toolResultData = {
            toolResults: [{
              tool: 'webSearchTool',
              success: true,
              data: webSearchResults,
              query: userMessage
            }],
            hasTools: true,
            toolsUsed: 1
          };
          res.write(`data: ${JSON.stringify({metadata: toolResultData})}\n\n`);
        }
        
        // Send file processing results
        if (processedFiles.length > 0) {
          const fileResultData = {
            filesProcessed: processedFiles.map(file => ({
              name: file.originalName,
              type: file.type,
              size: file.size,
              processed: file.processed
            })),
            hasFiles: true,
            filesCount: processedFiles.length
          };
          res.write(`data: ${JSON.stringify({metadata: fileResultData})}\n\n`);
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
          const responseMetadata = { 
            model: aiResponse.model,
            responseTime: Date.now() - Date.now(),
            filesProcessed: processedFiles.length
          };
          
          await conversationService.addMessage(
            userId, 
            conversation._id, 
            'assistant', 
            aiResponse.response, 
            null, 
            responseMetadata
          );

          // Queue user message for asynchronous profile analysis
          const analysisJobId = analysisQueue.enqueue(userId, finalMessage, {
            conversationId: conversation._id,
            timestamp: new Date(),
            source: 'social_chat_files',
            hasAttachments: processedFiles.length > 0,
            fileTypes: processedFiles.map(f => f.type)
          });
          
          log.debug(`📊 Profile analysis queued with files: ${analysisJobId}`, { 
            userId, 
            fileCount: processedFiles.length,
            correlationId 
          });

          // Auto-mark welcome as seen if this was a first message welcome response
          if (userContext?.messageCount === 0 && !userContext?.onboarding?.hasSeenWelcome) {
            try {
              await User.findByIdAndUpdate(userId, {
                $set: {
                  'onboarding.hasSeenWelcome': true,
                  'onboarding.welcomeShownAt': new Date()
                }
              });
              log.debug('🎯 Welcome prompt automatically marked as seen', { userId, correlationId });
            } catch (error) {
              log.error('Failed to auto-mark welcome as seen', error, { userId, correlationId });
            }
          }
        }
      } else {
        res.write(`data: ${JSON.stringify({content: 'Sorry, I encountered an error processing your request. Please try again.'})}\n\n`);
        res.write(`data: [DONE]\n\n`);
      }
      
      res.end();
    } catch (streamError) {
      log.error('Streaming error', streamError, { correlationId });
      res.write(`data: ${JSON.stringify({content: 'Error occurred during streaming.'})}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
    
  } catch (error) {
    log.error('Social chat with files failed', error, { correlationId });
    log.request.complete(correlationId, 500, Date.now() - startTime);
    
    // Send error response if headers not sent
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: error.message
      });
    }
  } finally {
    // Ensure successful requests are logged
    if (res.statusCode !== 500) {
      log.request.complete(correlationId, res.statusCode || 200, Date.now() - startTime);
    }
  }
});

export default router;