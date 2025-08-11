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
import previewRoutes from './routes/preview.js';
import chatRoutes from './routes/chat.js';
import spotifyRoutes from './routes/spotify.js';
import notificationRoutes from './routes/notifications.js';
import badgeRoutes from './routes/badges.js';
import memoryRoutes from './routes/memory.js';

// New artist-focused routes
import artistRoutes from './routes/artists.js';
import feedRoutes from './routes/feed.js';
import analyticsRoutes from './routes/analytics.js';

// Friends functionality routes
import friendsRoutes from './routes/friends.js';
import friendMessagingRoutes from './routes/friendMessaging.js';

// Social proxy compatibility routes
import socialProxyRoutes from './routes/social-proxy.js';

// Initialize models
import './models/User.js';
import './models/Artist.js';
import './models/ArtistUpdate.js';
import './models/UserAnalytics.js';
import './models/UserBadge.js';
import './models/Conversation.js';
import './models/UserMemory.js';
import './models/Activity.js';

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
    app.use('/api', previewRoutes);
    app.use('/spotify', spotifyRoutes);
    app.use('/notifications', notificationRoutes);
    app.use('/memory', memoryRoutes);
    app.use('/', chatRoutes);
    
    // Artist-focused routes
    app.use('/artists', artistRoutes);
    app.use('/feed', feedRoutes);
    app.use('/analytics', analyticsRoutes);
    
    // Friends functionality routes
    app.use('/friends', friendsRoutes);
    app.use('/friend-messaging', friendMessagingRoutes);
    
    // Social proxy compatibility routes
    app.use('/social-proxy', socialProxyRoutes);
    
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
      console.log(`🚀 Aether Artist Tracking Server running on port ${PORT}`);
      console.log(`🎵 API endpoints: /auth, /user, /artists, /feed, /analytics, /spotify, /chat`);
      console.log(`👥 Friends endpoints: /friends, /friend-messaging`);
      console.log(`📱 Compatibility: /social-proxy (for front-end compatibility)`);
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