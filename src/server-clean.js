import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import aiService from "./services/aiService.js";
import messageService from "./services/messageService.js";
import webSearchTool from "./tools/webSearchTool.js";

/**
 * Aether Social Chat Server - Clean & Simple
 * 
 * Stripped down version focused on social chat functionality
 */

// Import logger and config
import { log } from "./utils/logger.js";
import "./config/environment.js";
import connectDB from "./config/database.js";

// Simple route imports  
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js"; 
import healthRoutes from "./routes/health.js";
import aiRoutes from "./routes/ai.js";
import conversationRoutes from "./routes/conversation.js";

// Import basic middleware
import { corsSecurity, securityHeaders } from "./middleware/security.js";
import { protect } from "./middleware/auth.js";
import { requestLogger, errorLogger } from "./utils/logger.js";
import { globalErrorHandler } from "./utils/errorHandler.js";

// Database models
import "./models/User.js";
import "./models/Message.js";
import "./models/Conversation.js";

const app = express();

log.debug("Aether Social Chat Server - Starting initialization");

/**
 * Initialize clean server
 */
const initializeServer = async () => {
  try {
    // Connect to database first
    await connectDB();
    log.database("✅ Database connection established");

    // Basic security middleware
    app.use(helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false
    }));
    app.use(compression());
    
    // CORS configuration
    app.use(corsSecurity);
    app.use(securityHeaders);
    
    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    
    // Request logging
    app.use(requestLogger);
    
    // Routes - Clean and simple
    app.use('/', healthRoutes);
    app.use('/auth', authRoutes);
    app.use('/user', userRoutes);
    app.use('/ai', aiRoutes);
    app.use('/conversation', conversationRoutes);
    
    // Create social-chat endpoint with streaming support
    app.post('/social-chat', protect, async (req, res) => {
      try {
        const { message, prompt, stream = true } = req.body;
        const userMessage = message || prompt;
        const userId = req.user?.id; // From auth middleware
        
        console.log('🔍 DEBUG - Social Chat Request:', {
          message: userMessage,
          stream,
          userId,
          hasUser: !!req.user,
          bodyKeys: Object.keys(req.body),
          headers: req.headers.authorization ? 'present' : 'missing'
        });
        
        if (!userMessage) {
          console.log('❌ DEBUG - Missing message/prompt parameter');
          return res.status(400).json({ error: 'Message or prompt is required' });
        }
        
        // Save user message if authenticated
        if (userId) {
          await messageService.saveMessage(userId, userMessage, 'user');
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

          // Get AI response with enhanced message
          const aiResponse = await aiService.chat(enhancedMessage);
          
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
              await new Promise(resolve => setTimeout(resolve, 25)); // Much faster: 25ms delay
            }
            
            // Send completion signal
            res.write(`data: [DONE]\n\n`);
            
            // Save AI response if authenticated
            if (userId) {
              await messageService.saveMessage(userId, aiResponse.response, 'ai', aiResponse.model);
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
    
    // Error handling
    app.use(errorLogger);
    app.use(globalErrorHandler);
    
    // Start server
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Aether Social Chat Server running on port ${PORT}`);
      console.log(`📱 API endpoints: /auth, /user, /conversation, /social-chat`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    return server;
    
  } catch (error) {
    log.error('Server initialization failed:', error);
    process.exit(1);
  }
};

// Initialize server
initializeServer().catch(error => {
  log.error('Failed to start server:', error);
  process.exit(1);
});

export default app;