import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import fetch from "node-fetch";

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
import "./models/Conversation.js";
import "./models/ShortTermMemory.js";

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
    
    // Create social-chat endpoint with OpenRouter
    app.post('/social-chat', async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }
        
        // Direct OpenRouter call - simple and clean
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Title': 'Aether Social Chat'
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3-haiku',
            messages: [
              { role: 'system', content: 'You are a friendly AI assistant in a social chat app. Be helpful and conversational.' },
              { role: 'user', content: message }
            ],
            max_tokens: 800,
            temperature: 0.7
          })
        });
        
        const data = await openRouterResponse.json();
        const response = { content: data.choices[0].message.content };
        
        res.json({
          success: true,
          response: response.content,
          timestamp: new Date().toISOString(),
          model: 'claude-3-haiku'
        });
        
      } catch (error) {
        console.error('Social chat error:', error);
        
        // Fallback to echo if OpenRouter fails
        res.json({
          success: true,
          response: `Echo (OpenRouter unavailable): ${req.body.message}`,
          timestamp: new Date().toISOString(),
          fallback: true
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