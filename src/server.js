import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import dotenv from "dotenv";
import mongoose from "mongoose";
import https from "https";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import healthRoutes from "./routes/health.js";
import completionRoutes from "./routes/completion.js";
import taskRoutes from "./routes/tasks.js";
import docsRoutes from "./routes/docs.js";

// Import middleware
import { corsMiddleware, securityMiddleware, optimizedCompression } from "./middleware/security.js";
import { requestLogger, errorLogger } from "./utils/logger.js";
import { globalErrorHandler } from "./utils/errorHandler.js";

// Import utilities
import { createCache, setupMemoryMonitoring } from "./utils/cache.js";

// Import services
import taskScheduler from "./services/taskScheduler.js";

// Import models (to ensure they're loaded)
import "./models/User.js";
import "./models/ShortTermMemory.js";
import "./models/Task.js";

dotenv.config();

const app = express();

// --- Performance Monitoring Middleware ---
const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const memUsage = process.memoryUsage();
    
    console.log(`${req.method} ${req.path} - ${duration}ms - ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    
    if (duration > 5000) {
      console.warn(`🐌 SLOW REQUEST: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  
  next();
};

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

// --- Security and Middleware Configuration ---
app.use(performanceMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(securityMiddleware);

// Use optimized compression middleware
app.use(optimizedCompression);

app.use(memoryCleanupMiddleware);

// --- Logging Middleware ---
app.use(requestLogger);

// --- Optimized Database Connection ---
mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 50,           // Increased pool size
  minPoolSize: 5,            // Maintain minimum connections
  maxIdleTimeMS: 30000,      // Close idle connections
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4,
  bufferCommands: false,     // Disable mongoose buffering
  bufferMaxEntries: 0,       // Disable mongoose buffering
})
.then(() => console.log("✓MongoDB connected with optimized pool settings"))
.catch((err) => {
  console.error("✗ MongoDB connection error:", err);
  process.exit(1);
});

// --- Global HTTPS Agent for Performance ---
const globalHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  rejectUnauthorized: false,
  timeout: 60000,
});

app.locals.httpsAgent = globalHttpsAgent;

// --- Cache and Memory Management ---
app.locals.cache = createCache();
setupMemoryMonitoring();

// --- Route Registration ---
app.use("/", authRoutes);
app.use("/", userRoutes);
app.use("/", healthRoutes);
app.use("/", completionRoutes);
app.use("/", taskRoutes);
app.use("/", docsRoutes);

// --- Start Task Scheduler ---
if (process.env.NODE_ENV !== 'test') {
  taskScheduler.start();
}

// --- Error Handling ---
app.use(errorLogger);
app.use(globalErrorHandler);

// --- Server Start ---
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`✓API running → http://localhost:${PORT}`);
    console.log(`✓Performance optimizations enabled`);
    console.log(`✓Memory optimization enabled, initial RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);
  });
}

export default app;