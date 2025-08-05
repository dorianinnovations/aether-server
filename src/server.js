import express from 'express';
import helmet from 'helmet';
import compression from 'compression';

// Core imports
import { log, requestLogger, errorLogger, globalErrorHandler } from './utils/index.js';
import { connectDB } from './config/index.js';
import { corsSecurity, securityHeaders } from './middleware/index.js';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import healthRoutes from './routes/health.js';
import aiRoutes from './routes/ai.js';
import conversationRoutes from './routes/conversation.js';
// import matchingRoutes from './routes/matching.js'; // REMOVED - no more dating
import friendsRoutes from './routes/friends.js';
import eventsRoutes from './routes/events.js';
import previewRoutes from './routes/preview.js';
import socialChatRoutes from './routes/socialChat.js';
import socialProxyRoutes from './routes/socialProxy.js';
import spotifyRoutes from './routes/spotify.js';

// Initialize models
import './models/User.js';
import './models/Message.js';
import './models/Conversation.js';
import './models/Activity.js';

// Initialize services
import './services/analysisQueue.js';

const app = express();

/**
 * Initialize Aether Social Chat Server
 */
const initializeServer = async () => {
  try {
    // Connect to database
    await connectDB();
    log.database('✅ Database connection established');

    // Security middleware
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
    
    // API Routes
    app.use('/', healthRoutes);
    app.use('/auth', authRoutes);
    app.use('/user', userRoutes);
    app.use('/ai', aiRoutes);
    app.use('/conversation', conversationRoutes);
    // app.use('/matching', matchingRoutes); // REMOVED - no more dating
    app.use('/friends', friendsRoutes);
    app.use('/events', eventsRoutes);
    app.use('/api', previewRoutes);
    app.use('/social-proxy', socialProxyRoutes);
    app.use('/spotify', spotifyRoutes);
    app.use('/', socialChatRoutes);
    
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