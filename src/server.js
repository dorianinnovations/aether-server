import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import https from "https";

console.log("🚀 Starting Numina Server initialization...");

// Centralized configuration
import "./config/environment.js";
import connectDB from "./config/database.js";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import healthRoutes from "./routes/health.js";
import completionRoutes from "./routes/completion.js";
import taskRoutes from "./routes/tasks.js";
import docsRoutes from "./routes/docs.js";
import emotionsRoutes from "./routes/emotions.js";
import emotionHistoryRoutes from "./routes/emotionHistory.js";
import emotionMetricsRoutes from "./routes/emotionMetrics.js";
import analyticsRoutes from "./routes/analytics.js";
import collectiveDataRoutes from "./routes/collectiveData.js";
import collectiveSnapshotsRoutes from "./routes/collectiveSnapshots.js";
import scheduledAggregationRoutes from "./routes/scheduledAggregation.js";
import aiRoutes from "./routes/ai.js";
import cloudRoutes from "./routes/cloud.js";

console.log("✓All route modules imported successfully");

// Import middleware
import { corsSecurity, securityHeaders, validateContent, sanitizeRequest } from "./middleware/security.js";
import { requestLogger, errorLogger } from "./utils/logger.js";
import { globalErrorHandler } from "./utils/errorHandler.js";
import { performanceMiddleware as enhancedPerformanceMiddleware, completionPerformanceMiddleware } from "./middleware/performanceMiddleware.js";

console.log("✓All middleware modules imported successfully");

// Import utilities
import { createCache, setupMemoryMonitoring } from "./utils/cache.js";

console.log("✓Utility modules imported successfully");

// Import services
import taskScheduler from "./services/taskScheduler.js";
import scheduledAggregationService from "./services/scheduledAggregationService.js";

console.log("✓Service modules imported successfully");

// Import models (to ensure they're loaded)
import "./models/User.js";
import "./models/ShortTermMemory.js";
import "./models/Task.js";
import "./models/EmotionalAnalyticsSession.js";
import "./models/CollectiveDataConsent.js";
import "./models/CollectiveSnapshot.js";
import "./models/Event.js";

console.log("✓All database models loaded successfully");

const app = express();

console.log("✓Express application created");

// Initialize server function
const initializeServer = async () => {
  console.log("🔧 Beginning server initialization...");
  
  // --- Memory Cleanup Middleware ---
  const memoryCleanupMiddleware = (req, res, next) => {
    res.on('finish', () => {
      // Clean up request-specific data
      if (req.user) delete req.user;
      if (req.body) delete req.body;
      
      // Suggest GC on large responses
      if (res.get('content-length') > 100000) {
        setImmediate(() => {
          if (global.gc) global.gc();
        });
      }
    });
    next();
  };

  console.log("✓Memory cleanup middleware configured");

  // --- Security and Middleware Configuration ---
  app.use(enhancedPerformanceMiddleware);
  app.use(corsSecurity);
  app.use(express.json({ limit: "1mb" }));
  app.use(validateContent);
  app.use(sanitizeRequest);
  app.use(securityHeaders);
  app.use(compression());
  app.use(memoryCleanupMiddleware);
  app.use(requestLogger);

  console.log("✓All security and middleware configured");

  // --- Database Connection ---
  console.log("🗄️ Connecting to MongoDB...");
  await connectDB();

  // --- Global HTTPS Agent for Performance ---
  const globalHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    rejectUnauthorized: false,
    timeout: 60000,
  });

  app.locals.httpsAgent = globalHttpsAgent;
  console.log("✓HTTPS agent configured for external API calls");

  // --- Cache and Memory Management ---
  console.log("💾 Initializing cache and memory monitoring...");
  app.locals.cache = createCache();
  setupMemoryMonitoring();
  console.log("✓Cache and memory monitoring initialized");

  // --- Route Registration ---
  console.log("🛣️ Registering API routes...");
  app.use("/", authRoutes);
  app.use("/", userRoutes);
  app.use("/", healthRoutes);
  app.use("/", completionPerformanceMiddleware, completionRoutes);
  app.use("/", taskRoutes);
  app.use("/", docsRoutes);
  app.use("/emotions", emotionsRoutes);
  app.use("/emotion-history", emotionHistoryRoutes);
  app.use("/emotion-metrics", emotionMetricsRoutes);
  app.use("/analytics", analyticsRoutes);
  app.use("/collective-data", collectiveDataRoutes);
  app.use("/collective-snapshots", collectiveSnapshotsRoutes);
  app.use("/scheduled-aggregation", scheduledAggregationRoutes);
  app.use("/ai", aiRoutes);
  app.use("/cloud", cloudRoutes);

  console.log("✓All API routes registered successfully");

  // Simple test endpoint to verify routing
  app.get("/test", (req, res) => {
    res.json({
      success: true,
      message: "Server is running correctly",
      timestamp: new Date().toISOString(),
      routes: [
        "/collective-data/health",
        "/collective-snapshots/health",
        "/collective-data/formatted",
        "/collective-snapshots/latest"
      ]
    });
  });

  console.log("✓Test endpoint configured");

  // --- Environment Variable Validation ---
  console.log("🔍 Validating environment variables...");
  const requiredEnvVars = ['OPENROUTER_API_KEY', 'MONGO_URI'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.warn('⚠️ Missing required environment variables:', missingEnvVars.join(', '));
    console.warn('⚠️ Some features may not work properly without these variables');
  } else {
    console.log("✓All required environment variables are present");
  }

  // --- Scheduled Aggregation Service ---
  if (process.env.NODE_ENV !== 'test') {
    console.log("⏰ Starting scheduled aggregation service...");
    // Start scheduled aggregation service
    scheduledAggregationService.start();
    console.log("✓Scheduled aggregation service started (10-minute intervals)");
  }

  // --- Error Handling ---
  console.log("🛡️ Configuring error handling middleware...");
  app.use(errorLogger);
  app.use(globalErrorHandler);
  console.log("✓Error handling middleware configured");

  // --- Server Start ---
  if (process.env.NODE_ENV !== 'test') {
    console.log("🌐 Starting HTTP server...");
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`✓API running → http://localhost:${PORT}`);
      console.log(`✓Performance optimizations enabled`);
      console.log(`✓Memory optimization enabled, initial RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
      console.log("🎉 Server initialization completed successfully!");
    });
  }
};

// Start the server
if (process.env.NODE_ENV !== 'test') {
  console.log("🚀 Launching server...");
  initializeServer().catch(err => {
    console.error('❌ Failed to initialize server:', err);
    process.exit(1);
  });
}

export default app;