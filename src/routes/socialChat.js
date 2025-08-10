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

// Unified chat endpoint - handles both text and files
router.post('/social-chat', protect, uploadFiles, validateUploadedFiles, handleMulterError, async (req, res) => {
  const startTime = Date.now();
  const correlationId = log.info("POST /social-chat", { userId: req.user?.id });
  // Chat request timing - reduced logging
  
  try {
    const { message, prompt, stream = true, conversationId, attachments } = req.body;
    const userMessage = message || prompt;
    const userId = req.user?.id;
    const uploadedFiles = req.validatedFiles || [];
    
    log.debug('Unified chat request', {
      correlationId,
      messageLength: userMessage?.length || 0,
      stream,
      conversationId: conversationId || 'NOT_PROVIDED',
      attachmentCount: attachments?.length || 0,
      fileCount: uploadedFiles.length,
      userId
    });
    
    if (!userMessage && (!attachments || attachments.length === 0) && uploadedFiles.length === 0) {
      log.warn('Social chat rejected - no content', { correlationId });
      return res.status(400).json({ error: 'Message, attachments, or files are required' });
    }
    
    // Process uploaded files if any
    let processedFiles = [];
    if (uploadedFiles.length > 0) {
      try {
        processedFiles = await fileProcessingService.processFiles(uploadedFiles);
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
    
    // Handle blank/contextless messages with attachments
    let processedMessage = userMessage;
    if ((!userMessage || userMessage.trim() === '') && attachments && attachments.length > 0) {
      processedMessage = `I'd like you to analyze what I've shared with you. Please take a close look and tell me what you see, think, or find interesting about it. 

If this content reveals something compelling about my interests, hobbies, projects, or personality that might be worth sharing with friends and family through my Aether profile, feel free to mention that - but don't push it unless it's genuinely noteworthy or represents something I'm passionate about.

Just give me your honest thoughts on what I've sent.`;
    }
    
    // Get or create conversation - ALWAYS prefer continuing existing Aether thread
    let conversation;
    if (conversationId && conversationId !== 'default' && conversationId !== 'undefined') {
      // Get specific conversation if provided
      conversation = await conversationService.getConversation(userId, conversationId);
      if (!conversation) {
        // If specific conversation not found, fall back to main Aether thread
        console.log(`⚠️ Conversation ${conversationId} not found, falling back to main Aether thread`);
        conversationId = null;
      }
    }
    
    if (!conversation) {
      // Always try to continue existing Aether conversation first
      const conversations = await conversationService.getUserConversations(userId, { 
        limit: 1,
        type: 'aether'
      });
      
      if (conversations.conversations.length > 0) {
        conversation = conversations.conversations[0];
        // Continuing existing conversation
      } else {
        conversation = await conversationService.createConversation(userId, 'Chat with Aether', 'aether');
        console.log(`🆕 Created new Aether thread: ${conversation._id}`);
      }
    }
    
    // Get user context for AI personalization
    let userContext = null;
    if (userId) {
      const user = await User.findById(userId).select('username socialProxy profile onboarding');
      if (user) {
        // Use conversation message count for prompt classification
        const messageCount = conversation.messageCount || 0;
        // // log step removed
        
        userContext = {
          username: user.username,
          socialProxy: user.socialProxy,
          onboarding: user.onboarding,
          messageCount: messageCount,
          conversationId: conversation._id,
          userId: userId
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
        /(?:what'?s|what is)\s+(the\s+)?(latest|recent|current|news about|happening with)\s+(.+)/i,
        /(?:when did|where is|what happened|current price|stock price|weather in)/i,
        /(?:latest news|recent developments|current events)/i
      ];
      
      const noSearchPatterns = [
        /^(?:hello|hi|hey|thanks|thank you|ok|okay|yes|no|maybe|what\?)$/i,
        /^(?:how are you|good morning|good afternoon|good evening)$/i,
        /(?:who are you|what are you|tell me about yourself|introduce yourself)/i,
        /(?:who's this|whos this|what is this|whats this)/i,
        /^(?:what\?|huh\?|why\?|how\?)$/i,
        /^(?:yo|sup|whats up|wassup|hey there|whats happening)$/i,
        /^(?:yo whats good|whats good|all good|im good|you good|doing good)$/i,
        /^(?:yo|sup|hey)\s+(?:whats good|whats up|wassup)$/i
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
        // // log step removed
        try {
          const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
          if (searchResult.success && searchResult.structure.results.length > 0) {
            webSearchResults = searchResult;
            
            // Add search results to message context
            const searchContext = `Web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this current information to provide an accurate, up-to-date response. Do not include the raw search results or JSON data in your response - just use the information naturally in your answer.`;
            
            enhancedMessage = `${processedMessage}\n\n${searchContext}`;
            // // log step removed
          }
        } catch (error) {
          log.error('Web search failed', error, { correlationId });
        }
      }

        // Get AI streaming response - handle both attachments and processed files
      const aiCallStartTime = Date.now();
      log.debug('Starting AI service call', { 
        correlationId,
        elapsedTime: aiCallStartTime - startTime,
        hasProcessedFiles: processedFiles.length > 0,
        hasAttachments: !!attachments?.length 
      });
      let aiResponse;
      if (processedFiles.length > 0) {
        // Use processed files for multimodal AI
        aiResponse = await aiService.chatWithFiles(enhancedMessage, 'openai/gpt-4o', userContext, processedFiles);
      } else {
        // Use regular chat with attachments (model will be selected by tierService)
        aiResponse = await aiService.chat(enhancedMessage, 'openai/gpt-4o', userContext, attachments);
      }
      const aiCallTime = Date.now() - aiCallStartTime;
      log.debug('AI service call completed', { correlationId, aiCallTime });
      
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
        
        // SIMPLIFIED STREAMING - back to working approach but faster
        let fullResponse = '';
        
        // Emergency streaming disable flag for debugging blank responses
        const streamingDisabled = process.env.DISABLE_STREAMING === 'true';
        const fastMode = process.env.FAST_MODE === 'true';
        const useFallback = process.env.USE_GPT4O_FALLBACK === 'true';
        // Streaming mode configured
        
        try {
          if (streamingDisabled) {
            console.log('⚡ Using NON-STREAMING mode for debugging');
            // Just get the response without streaming
            const data = await response.json();
            
            console.log(`📄 Non-streaming LLM Response Debug:`, {
              hasData: !!data,
              hasChoices: !!data.choices,
              choicesLength: data.choices?.length || 0,
              hasContent: !!data.choices?.[0]?.message?.content,
              contentLength: data.choices?.[0]?.message?.content?.length || 0,
              finishReason: data.choices?.[0]?.finish_reason,
              model: data.model
            });
            
            if (data.choices?.[0]?.message?.content) {
              fullResponse = data.choices[0].message.content;
              console.log(`✅ Non-streaming response: ${fullResponse.length} chars`);
              
              // Send complete response at once
              res.write(`data: ${JSON.stringify({content: fullResponse})}\n\n`);
            } else {
              console.log(`⚠️ BLANK NON-STREAMING RESPONSE! Data:`, JSON.stringify(data, null, 2));
              fullResponse = 'I apologize, but I\'m having trouble generating a response right now. Please try again.';
              res.write(`data: ${JSON.stringify({content: fullResponse})}\n\n`);
            }
            
            res.write(`data: [DONE]\n\n`);
          } else {
            console.log('🌊 Using STREAMING mode');
            // For now, let's fall back to the working method but make it faster
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
          
          console.log(`⏱️ Starting OpenRouter API call at +${Date.now() - startTime}ms`);
          const response = await fetch(aiResponse.originalUrl || 'https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: aiResponse.model || 'openai/gpt-4o', // Use model selected by tierService
              messages: aiResponse.messages,
              max_tokens: useFallback ? 1500 : 2500, // Increased tokens for better responses
              temperature: 0.7,
              stream: false // Back to non-streaming temporarily
            })
          });
          
          clearTimeout(timeoutId);
          const apiResponseTime = Date.now() - startTime;
          console.log(`⏱️ OpenRouter API responded in ${apiResponseTime}ms total`);
          
          const data = await response.json();
          console.log(`📋 JSON parsing completed at +${Date.now() - startTime}ms`);
          
          console.log(`📄 LLM Response Debug:`, {
            hasData: !!data,
            hasChoices: !!data.choices,
            choicesLength: data.choices?.length || 0,
            hasContent: !!data.choices?.[0]?.message?.content,
            contentLength: data.choices?.[0]?.message?.content?.length || 0,
            finishReason: data.choices?.[0]?.finish_reason,
            model: data.model
          });
          
          if (data.choices?.[0]?.message?.content) {
            fullResponse = data.choices[0].message.content;
            
            console.log(`✅ Full response received: ${fullResponse.length} chars, first 100: ${fullResponse.substring(0, 100)}`);
            
            const streamingStartTime = Date.now();
            console.log(`🌊 Starting word streaming at +${streamingStartTime - startTime}ms`);
            
            // Fast word streaming (better than before)
            const words = fullResponse.split(' ');
            console.log(`📝 Streaming ${words.length} words`);
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              res.write(`data: ${JSON.stringify({content: word})}\n\n`);
              // Fast mode: no delay, regular mode: 5ms delay
              if (!fastMode) {
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
            
            const streamingTime = Date.now() - streamingStartTime;
            console.log(`🌊 Streaming completed in ${streamingTime}ms`);
          } else {
            console.log(`⚠️ BLANK RESPONSE DETECTED! Data:`, JSON.stringify(data, null, 2));
            fullResponse = 'I apologize, but I\'m having trouble generating a response right now. Please try again.';
            res.write(`data: ${JSON.stringify({content: fullResponse})}\n\n`);
          }
          
          console.log(`🏁 Sending [DONE] at +${Date.now() - startTime}ms`);
          res.write(`data: [DONE]\n\n`);
          console.log(`🏁 [DONE] sent successfully`);
          }
          
        } catch (streamError) {
          log.error('Streaming error:', streamError, { correlationId });
          res.write(`data: ${JSON.stringify({content: 'Stream error occurred.'})}\n\n`);
          res.write(`data: [DONE]\n\n`);
        }
        
        // Save AI response if authenticated  
        const preSaveTime = Date.now();
        console.log(`💾 Starting response save at +${preSaveTime - startTime}ms`);
        
        const aiResponseTime = Date.now() - startTime;
        console.log(`💾 Response complete: userId=${!!userId}, responseLength=${fullResponse?.length || 0}, totalTime=${aiResponseTime}ms`);
        
        if (userId && fullResponse) {
          await conversationService.addMessage(
            userId, 
            conversation._id, 
            'assistant', 
            fullResponse, 
            null, 
            { 
              model: aiResponse.model,
              responseTime: Date.now() - startTime
            }
          );

          // Queue user message for asynchronous profile analysis  
          const preAnalysisTime = Date.now();
          console.log(`📊 Analysis queue time: +${preAnalysisTime - startTime}ms`);
          
          // TEMP: Skip analysis queue for performance testing
          if (process.env.SKIP_ANALYSIS !== 'true') {
            const analysisJobId = analysisQueue.enqueue(userId, processedMessage, {
            conversationId: conversation._id,
            timestamp: new Date(),
            source: 'social_chat'
          });
          
          log.debug(`📊 Profile analysis queued: ${analysisJobId}`, { userId, correlationId });
          } else {
            console.log('⏩ Skipping profile analysis for performance testing');
          }

          // Auto-mark welcome as seen if this was a first time welcome response
          if (!userContext?.onboarding?.hasSeenWelcome) {
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
    // log.info("Request completed");
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  } finally {
    // Ensure successful requests are logged
    if (res.statusCode !== 500) {
      // log.info("Request completed");
    }
  }
});

// Enhanced chat endpoint with file upload support
router.post('/social-chat-with-files', protect, uploadFiles, validateUploadedFiles, handleMulterError, async (req, res) => {
  const startTime = Date.now();
  const correlationId = log.info("POST /social-chat", { userId: req.user?.id });
  
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
      // // log step removed
      
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
        // // log step removed
        
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
    
    // Get or create conversation - ALWAYS prefer continuing existing Aether thread
    let conversation;
    if (conversationId && conversationId !== 'default' && conversationId !== 'undefined') {
      // Get specific conversation if provided
      conversation = await conversationService.getConversation(userId, conversationId);
      if (!conversation) {
        // If specific conversation not found, fall back to main Aether thread
        console.log(`⚠️ Conversation ${conversationId} not found, falling back to main Aether thread`);
        conversationId = null;
      }
    }
    
    if (!conversation) {
      // Always try to continue existing Aether conversation first
      const conversations = await conversationService.getUserConversations(userId, { 
        limit: 1,
        type: 'aether'
      });
      
      if (conversations.conversations.length > 0) {
        conversation = conversations.conversations[0];
        // Continuing existing conversation
      } else {
        conversation = await conversationService.createConversation(userId, 'Chat with Aether', 'aether');
        console.log(`🆕 Created new Aether thread: ${conversation._id}`);
      }
    }
    
    // Get user context for AI personalization
    let userContext = null;
    if (userId) {
      const user = await User.findById(userId).select('username socialProxy profile onboarding');
      if (user) {
        const messageCount = conversation.messageCount || 0;
        // // log step removed
        
        userContext = {
          username: user.username,
          socialProxy: user.socialProxy,
          onboarding: user.onboarding,
          messageCount: messageCount,
          conversationId: conversation._id,
          userId: userId
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
          // // log step removed
          try {
            const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
            if (searchResult.success && searchResult.structure.results.length > 0) {
              webSearchResults = searchResult;
              
              const searchContext = `Web search results for "${cleanMessage}":
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Use this current information to provide an accurate, up-to-date response. Do not include the raw search results or JSON data in your response - just use the information naturally in your answer.`;
              
              enhancedMessage = `${userMessage}\n\n${searchContext}`;
              // // log step removed
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

          // Auto-mark welcome as seen if this was a first time welcome response
          if (!userContext?.onboarding?.hasSeenWelcome) {
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
    // log.info("Request completed");
    
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
      // log.info("Request completed");
    }
  }
});

export default router;