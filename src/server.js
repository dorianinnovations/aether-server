// Ensure env is loaded in all entry points
import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Core imports
import { log, requestLogger, errorLogger, globalErrorHandler } from './utils/index.js';
import { connectDB } from './config/index.js';
import { corsSecurity, securityHeaders } from './middleware/index.js';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import healthRoutes from './routes/health.js';
import conversationRoutes from './routes/conversation.js';
// import matchingRoutes from './routes/matching.js'; // REMOVED - no more dating
import friendsRoutes from './routes/friends.js';
import previewRoutes from './routes/preview.js';
import socialChatRoutes from './routes/socialChat.js';
import socialProxyRoutes from './routes/socialProxy.js';
import spotifyRoutes from './routes/spotify.js';
import notificationRoutes from './routes/notifications.js';
import friendMessagingRoutes from './routes/friendMessaging.js';
import badgeRoutes from './routes/badges.js';
import memoryRoutes from './routes/memory.js';

// Initialize models
import './models/User.js';
import './models/UserBadge.js';
import './models/Conversation.js';
import './models/Activity.js';
import './models/UserMemory.js';

// Initialize services
import analysisQueue from './services/analysisQueue.js';
import notificationService from './services/notificationService.js';
import spotifyLiveService from './services/spotifyLiveService.js';

const app = express();

/**
 * Initialize Aether Social Chat Server
 */
const initializeServer = async () => {
  try {
    // Debug env loading
    console.log('[BOOT] OPENROUTER_API_KEY set:', !!process.env.OPENROUTER_API_KEY);
    console.log('[BOOT] GPT-5 + RAG fixes deployed ✅');
    
    // Connect to database
    await connectDB();
    log.info('✅ Database connection established');

    // Setup analysis queue event handlers for real-time notifications
    analysisQueue.on('analysisComplete', (result) => {
      if (result.success && result.updates) {
        const sent = notificationService.notifyProfileUpdate(result.userId, result.updates);
        if (sent) {
          log.debug(`🔔 Profile update notification sent to user ${result.userId}`);
        }
      }
    });

    analysisQueue.on('analysisError', (error) => {
      log.warn(`Analysis error for user ${error.userId}: ${error.error}`);
      // Could send error notification if desired
    });

    log.info('Analysis queue event handlers initialized');

    // Start Spotify Live Service for background updates
    spotifyLiveService.start();
    log.info('Spotify Live Service started');

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
    app.use('/badges', badgeRoutes);
    app.use('/conversation', conversationRoutes);
    // app.use('/matching', matchingRoutes); // REMOVED - no more dating
    app.use('/friends', friendsRoutes);
    app.use('/api', previewRoutes);
    app.use('/social-proxy', socialProxyRoutes);
    app.use('/spotify', spotifyRoutes);
    app.use('/notifications', notificationRoutes);
    app.use('/friend-messaging', friendMessagingRoutes);
    app.use('/memory', memoryRoutes);
    app.use('/', socialChatRoutes);
    
    // Error handling
    app.use(errorLogger);
    app.use(globalErrorHandler);
    
    // Start server with Socket.IO
    const PORT = process.env.PORT || 5000;
    const server = createServer(app);
    const io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? 
          ['https://aether-server-j5kh.onrender.com'] : 
          ['http://localhost:3000', 'exp://192.168.1.100:8081', 'exp://localhost:8081'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Initialize real-time messaging
    const { initializeRealTimeMessaging } = await import('./services/realTimeMessaging.js');
    initializeRealTimeMessaging(io);
    
    server.listen(PORT, () => {
      console.log(`🚀 Aether Social Chat Server running on port ${PORT}`);
      console.log(`📱 API endpoints: /auth, /user, /social-chat, /social-proxy, /spotify, /friend-messaging`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`⚡ Socket.IO real-time messaging enabled`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      
      // Stop background services
      spotifyLiveService.stop();
      log.info('Background services stopped');
      
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