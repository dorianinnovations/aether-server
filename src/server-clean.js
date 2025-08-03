import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import aiService from "./services/aiService.js";
import messageService from "./services/messageService.js";

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
import conversationRoutes from "./routes/conversation.js";

// Import basic middleware
import { corsSecurity, securityHeaders } from "./middleware/security.js";
import { requestLogger, errorLogger } from "./utils/logger.js";
import { globalErrorHandler } from "./utils/errorHandler.js";

// Database models
import "./models/User.js";
import "./models/Message.js";

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
    app.use('/conversation', conversationRoutes);
    
    // Create social-chat endpoint with streaming support
    app.post('/social-chat', async (req, res) => {
      try {
        const { message, stream = true } = req.body;
        const userId = req.user?.id; // From auth middleware
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }
        
        // Save user message if authenticated
        if (userId) {
          await messageService.saveMessage(userId, message, 'user');
        }
        
        if (stream) {
          // Set up Server-Sent Events
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
          });
          
          // Get streaming AI response
          const aiResponse = await aiService.chatStream(message);
          
          if (aiResponse.success) {
            // Stream the response word by word
            const words = aiResponse.response.split(' ');
            for (let i = 0; i < words.length; i++) {
              res.write(words[i]);
              if (i < words.length - 1) res.write(' ');
              await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between words
            }
            
            // Save AI response if authenticated
            if (userId) {
              await messageService.saveMessage(userId, aiResponse.response, 'ai', aiResponse.model);
            }
          }
          
          res.end();
        } else {
          // Non-streaming fallback
          const aiResponse = await aiService.chat(message);
          
          if (aiResponse.success) {
            if (userId) {
              await messageService.saveMessage(userId, aiResponse.response, 'ai', aiResponse.model);
            }
            
            res.json({
              success: true,
              response: aiResponse.response,
              thinking: aiResponse.thinking,
              timestamp: new Date().toISOString(),
              model: aiResponse.model,
              usage: aiResponse.usage
            });
          } else {
            res.status(500).json({ 
              success: false, 
              error: 'AI service unavailable',
              details: aiResponse.error 
            });
          }
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