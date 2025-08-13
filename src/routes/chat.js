import express from 'express';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import { log } from '../utils/logger.js';
import aiService from '../services/aiService.js';
import conversationService from '../services/conversationService.js';
import webSearchTool from '../tools/webSearchTool.js';
import User from '../models/User.js';
import { uploadFiles, handleMulterError, validateUploadedFiles } from '../middleware/fileUpload.js';
import fileProcessingService from '../services/fileProcessingService.js';
import analysisQueue from '../services/analysisQueue.js';
import tierService from '../services/tierService.js';

const router = express.Router();

// Artist-focused AI chat endpoint - handles both text and files
router.post('/chat', protect, uploadFiles, validateUploadedFiles, handleMulterError, async (req, res) => {
  const startTime = Date.now();
  const correlationId = crypto.randomUUID();
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

    // Check response usage limits
    const responseCheck = await tierService.trackResponse(userId);
    if (!responseCheck.success) {
      log.warn('Chat rejected - response limit reached', { 
        correlationId, 
        userId, 
        reason: responseCheck.reason,
        usageInfo: responseCheck.usageInfo 
      });
      return res.status(429).json({ 
        error: responseCheck.message,
        usageInfo: responseCheck.usageInfo,
        upgradeRequired: true
      });
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
    let musicDiscoveryContext = null;
    if (userId) {
      const user = await User.findById(userId).select('username displayName bio location musicProfile spotify onboarding artistPreferences analytics tier friends');
      if (user) {
        // Update Spotify data if connected
        if (user.musicProfile?.spotify?.connected) {
          const spotifyService = (await import('../services/spotifyService.js')).default;
          await spotifyService.updateUserSpotifyData(user);
          // Re-fetch user data after update
          const updatedUser = await User.findById(userId).select('username displayName bio location musicProfile spotify onboarding artistPreferences analytics tier friends');
          user.musicProfile = updatedUser.musicProfile;
        }
        
        // Use conversation message count for prompt classification
        const messageCount = conversation.messageCount || 0;
        
        // SIMPLIFIED CONTEXT - only essential data for fast OpenRouter calls
        userContext = {
          username: user.username,
          displayName: user.displayName,
          messageCount: messageCount,
          conversationId: conversation._id,
          userId: userId,
          tier: user.tier,
          
          // Essential onboarding context for welcome message logic
          onboarding: user.onboarding || {},
          
          // Maintain nested structure that PromptManager expects
          musicProfile: {
            mood: user.musicProfile?.mood || null,
            spotify: {
              currentTrack: user.musicProfile?.spotify?.currentTrack || null,
              recentTracks: (user.musicProfile?.spotify?.recentTracks || []).slice(0, 5), // Limit to 5 recent
              topTracks: user.musicProfile?.spotify?.topTracks || [], // Restore top tracks
              grails: user.musicProfile?.spotify?.grails || null,
            },
            musicPersonality: {
              discoveryStyle: user.musicProfile?.musicPersonality?.discoveryStyle || null
            }
          }
        };


        // Check for music discovery context
        if (conversationService.detectMusicDiscoveryContext(processedMessage)) {
          musicDiscoveryContext = await conversationService.buildMusicDiscoveryContext(userId, processedMessage);
          log.info('Music discovery context detected', { 
            userId, 
            hasPreferences: musicDiscoveryContext?.hasPreferences,
            recommendationType: musicDiscoveryContext?.recommendationType
          });
        }
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
      // Check if web search should be triggered or music news is needed
      let webSearchResults = null;
      let musicNewsContext = null;
      let enhancedMessage = processedMessage;
      
      // Music news integration for exceptional results on music discovery
      if (musicDiscoveryContext && musicDiscoveryContext.recommendationType === 'custom_list') {
        try {
          log.info('Fetching latest music news for enhanced discovery context');
          const musicNewsQueries = [
            'latest music releases this week',
            'new album releases 2025',
            'trending artists music news',
            'new music discoveries this month'
          ];
          
          const newsQuery = musicNewsQueries[Math.floor(Math.random() * musicNewsQueries.length)];
          const searchResult = await webSearchTool({ query: newsQuery }, { userId });
          
          if (searchResult.success && searchResult.structure.results.length > 0) {
            musicNewsContext = searchResult.structure.results.slice(0, 4).map(r => ({
              title: r.title,
              snippet: r.snippet,
              source: r.url
            }));
            
            const newsContext = `🎵 LATEST MUSIC NEWS CONTEXT:
${musicNewsContext.map(news => `• ${news.title}: ${news.snippet}`).join('\n')}

Use this current music information to provide up-to-date recommendations and discoveries alongside their personal preferences.`;
            
            enhancedMessage = `${processedMessage}\n\n${newsContext}`;
            log.info('Enhanced message with latest music news', { newsCount: musicNewsContext.length });
          }
        } catch (error) {
          log.error('Music news fetch failed', error, { correlationId });
        }
      }
      
      // Smart search triggers - ONLY for external information (not music discovery)
      if (!musicNewsContext) {
        const searchTriggers = [
          /(?:search|find|look up|google|web search)\s+(?:for\s+)?(.+)/i,
          /(?:what'?s|what is)\s+(the\s+)?(latest|recent|current|news about|happening with)\s+(.+)/i,
          /(?:when did|where is|what happened|current price|stock price|weather in)/i,
          /(?:latest news|recent developments|current events)/i,
          // Add song/music information search triggers
          /(?:search statistics about|information about|stats about|facts about).*(?:song|track|music|artist|album)/i
        ];
        
        const noSearchPatterns = [
          /^(?:hello|hi|hey|thanks|thank you|ok|okay|yes|no|maybe|what\?)$/i,
          /^(?:how are you|good morning|good afternoon|good evening)$/i,
          /(?:who are you|what are you|tell me about yourself|introduce yourself)/i,
          /(?:who's this|whos this|what is this|whats this)/i,
          /^(?:what\?|huh\?|why\?|how\?)$/i,
          /^(?:yo|sup|whats up|wassup|hey there|whats happening)$/i,
          /^(?:yo whats good|whats good|all good|im good|you good|doing good)$/i,
          /^(?:yo|sup|hey)\s+(?:whats good|whats up|wassup)$/i,
          // Skip search for music discovery queries since we have specialized handling
          /(?:what.*new music|new.*music.*out|recommend.*music|discover.*music)/i
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
          try {
            const searchResult = await webSearchTool({ query: cleanMessage }, { userId });
            if (searchResult.success && searchResult.structure.results.length > 0) {
              // Check if this is a song/music information request
              const isSongInfoRequest = /(?:search statistics about|information about|stats about|facts about).*(?:song|track|music|artist|album)/i.test(cleanMessage);
              
              if (isSongInfoRequest) {
                // For song info requests, don't set webSearchResults to avoid streaming errors
                // Instead, just add the search context to the message for AI processing
                const searchContext = `Web search results for song information:
${searchResult.structure.results.slice(0, 3).map(r => `- ${r.title}: ${r.snippet}`).join('\n')}

Based on this information, provide a conversational response about the song with interesting facts, chart performance, background, or other relevant details. Do not mention that you searched the web - just provide the information naturally.`;
                
                enhancedMessage = `${processedMessage}\n\n${searchContext}`;
                log.info('Song info request detected - search results added to context only', { correlationId });
              } else {
                // For other searches, use the original behavior
                webSearchResults = searchResult;
                
                // Add search results to message context with length limiting
                const searchResults = searchResult.structure.results.slice(0, 3).map(r => {
                  // Limit snippet length to prevent overly long contexts
                  const snippet = r.snippet && r.snippet.length > 200 ? 
                    r.snippet.substring(0, 200) + '...' : r.snippet;
                  return `- ${r.title}: ${snippet || 'No description available'}`;
                }).join('\n');
                
                const searchContext = `Web search results for "${cleanMessage}":
${searchResults}

Use this current information to provide an accurate, up-to-date response. Do not include the raw search results or JSON data in your response - just use the information naturally in your answer.`;
                
                enhancedMessage = `${processedMessage}\n\n${searchContext}`;
              }
            }
          } catch (error) {
            log.error('Web search failed', error, { correlationId });
          }
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
        // Pass music discovery context to LLM service
        aiResponse = await aiService.chat(enhancedMessage, 'openai/gpt-4o', userContext, attachments, {
          musicDiscoveryContext
        });
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
        
        // Always send conversation ID metadata first so frontend can sync state
        const conversationMetadata = {
          conversationId: conversation._id,
          conversationType: 'aether',
          isNewConversation: conversation.messageCount === 0
        };
        res.write(`data: ${JSON.stringify({metadata: conversationMetadata})}\n\n`);
        
        // Send music discovery context metadata if available
        if (musicDiscoveryContext || musicNewsContext) {
          const musicMetadata = {
            musicDiscovery: {
              contextDetected: !!musicDiscoveryContext,
              hasPreferences: musicDiscoveryContext?.hasPreferences || false,
              recommendationType: musicDiscoveryContext?.recommendationType || 'none',
              preferenceMaturity: musicDiscoveryContext?.preferenceMaturity || 'none',
              newsEnhanced: !!musicNewsContext,
              newsCount: musicNewsContext?.length || 0
            },
            hasMusicContext: true
          };
          res.write(`data: ${JSON.stringify({metadata: musicMetadata})}\n\n`);
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
            
            // Non-streaming response debug - removed
            
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
            // Using streaming mode
            // For now, let's fall back to the working method but make it faster
          // Add timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for better reliability
          
          // Starting API call
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
          // API responded
          
          const data = await response.json();
          // JSON parsing completed
          
          // LLM response debug - removed
          
          if (data.choices?.[0]?.message?.content) {
            fullResponse = data.choices[0].message.content;
            
            // Response received
            
            const streamingStartTime = Date.now();
            // Starting streaming
            
            // Fast word streaming (better than before)
            const words = fullResponse.split(' ');
            // Streaming words
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              res.write(`data: ${JSON.stringify({content: word})}\n\n`);
              // Fast mode: no delay, regular mode: 5ms delay
              if (!fastMode) {
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
            
            const streamingTime = Date.now() - streamingStartTime;
            // Streaming completed
          } else {
            console.log(`⚠️ BLANK RESPONSE DETECTED! Data:`, JSON.stringify(data, null, 2));
            fullResponse = 'I apologize, but I\'m having trouble generating a response right now. Please try again.';
            res.write(`data: ${JSON.stringify({content: fullResponse})}\n\n`);
          }
          
          // Sending completion
          res.write(`data: [DONE]\n\n`);
          // Completion sent
          }
          
        } catch (streamError) {
          log.error('Streaming error during search response:', streamError, { correlationId });
          
          // If this was a search query, try again without search context
          if (webSearchResults) {
            log.info('Retrying AI request without search context due to streaming error', { correlationId });
            try {
              // Retry with original message only (no search context)
              const retryResponse = await aiService.chat(processedMessage, 'openai/gpt-4o', userContext, attachments, {
                musicDiscoveryContext
              });
              
              if (retryResponse.success && retryResponse.content) {
                const retryFullResponse = retryResponse.content;
                res.write(`data: ${JSON.stringify({content: retryFullResponse})}\n\n`);
                res.write(`data: [DONE]\n\n`);
                fullResponse = retryFullResponse; // Set for saving
                log.info('Successfully recovered with non-search response', { correlationId });
              } else {
                res.write(`data: ${JSON.stringify({content: 'I apologize, but I encountered an issue processing your search request. Please try a simpler query.'})}\n\n`);
                res.write(`data: [DONE]\n\n`);
              }
            } catch (retryError) {
              log.error('Retry without search also failed:', retryError, { correlationId });
              res.write(`data: ${JSON.stringify({content: 'I apologize, but I\'m having trouble responding right now. Please try again.'})}\n\n`);
              res.write(`data: [DONE]\n\n`);
            }
          } else {
            // Original streaming error handling for non-search queries
            res.write(`data: ${JSON.stringify({content: 'Stream error occurred.'})}\n\n`);
            res.write(`data: [DONE]\n\n`);
          }
        }
        
        // CRITICAL FIX: Move all post-processing to async background
        // This prevents database/analytics errors from causing streaming errors
        setImmediate(async () => {
          try {
            if (userId && fullResponse) {
              await conversationService.addMessage(
                userId, 
                conversation._id, 
                'assistant', 
                fullResponse, 
                null, 
                { 
                  model: aiResponse.model,
                  responseTime: Date.now() - startTime,
                  musicDiscoveryContext: aiResponse.musicDiscoveryContext ? 'enhanced' : 'none'
                }
              );

              // Auto-learn music preferences from conversation
              if (musicDiscoveryContext) {
                try {
                  const ragMemoryService = (await import('../services/ragMemoryService.js')).default;
                  const preferencesLearned = await ragMemoryService.learnMusicPreferences(
                    userId, 
                    processedMessage, 
                    fullResponse
                  );
                  
                  if (preferencesLearned > 0) {
                    log.info('Music preferences auto-learned from conversation', {
                      userId,
                      conversationId: conversation._id,
                      preferencesLearned
                    });
                  }
                } catch (error) {
                  log.error('Failed to auto-learn music preferences:', error);
                }
              }

              // Update conversation state after assistant response
              if (aiResponse.queryType && aiService.updateConversationStateAfterResponse) {
                await aiService.updateConversationStateAfterResponse(
                  userContext, 
                  conversation._id, 
                  fullResponse, 
                  aiResponse.queryType
                );
              }

              // Queue user message for asynchronous profile analysis  
              if (process.env.SKIP_ANALYSIS !== 'true') {
                const analysisJobId = analysisQueue.enqueue(userId, processedMessage, {
                conversationId: conversation._id,
                timestamp: new Date(),
                source: 'social_chat'
              });
              
              log.debug(`📊 Profile analysis queued: ${analysisJobId}`, { userId, correlationId });
              }

              // Auto-mark welcome as seen
              if (aiResponse.queryType === 'first_message_welcome' && !userContext?.onboarding?.hasSeenWelcome) {
                try {
                  await User.findByIdAndUpdate(userId, {
                    $set: {
                      'onboarding.hasSeenWelcome': true,
                      'onboarding.welcomeShownAt': new Date()
                    }
                  });
                  
                  if (userContext && userContext.onboarding) {
                    userContext.onboarding.hasSeenWelcome = true;
                    userContext.onboarding.welcomeShownAt = new Date();
                  }
                  
                  log.debug('🎯 Welcome prompt automatically marked as seen', { userId, correlationId });
                } catch (error) {
                  log.error('Failed to auto-mark welcome as seen', error, { userId, correlationId });
                }
              }
            }
          } catch (postProcessError) {
            // Post-processing errors will NOT affect the user response
            log.error('Background post-processing error (user response already sent successfully):', postProcessError, { correlationId });
          }
        });
      } else {
        res.write(`data: ${JSON.stringify({content: 'Sorry, I encountered an error. Please try again.'})}\n\n`);
        res.write(`data: [DONE]\n\n`);
      }
      
      // End the response stream properly
      res.end();
      
      // Mark that response has been sent to prevent double responses
      const responseSent = true;
    } catch (streamError) {
      log.error('Critical streaming error:', streamError, { correlationId });
      
      // Only send error response if we haven't already sent one
      try {
        if (!res.headersSent) {
          res.write(`data: ${JSON.stringify({content: 'Error occurred during streaming.'})}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.end();
        }
      } catch (writeError) {
        log.error('Failed to send error response:', writeError, { correlationId });
      }
    }
    
  } catch (error) {
    log.error('Social chat failed', error, { correlationId });
    
    // Only send error response if we haven't started streaming yet
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    } else {
      // If headers were already sent, we were streaming, so just log the error
      log.error('Error occurred after streaming started - user may have received partial response', { correlationId });
    }
  } finally {
    // Ensure successful requests are logged
    if (res.statusCode !== 500) {
      // log.info("Request completed");
    }
  }
});


export default router;