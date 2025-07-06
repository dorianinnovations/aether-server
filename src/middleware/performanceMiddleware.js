import logger from '../utils/logger.js';
import { AnalyticsService } from '../services/analytics.js';

export const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  
  // Track specific operations
  req.performanceMetrics = {
    start,
    operations: {},
    memory: {
      start: process.memoryUsage().heapUsed
    }
  };
  
  // Helper function to track operation duration
  req.trackOperation = (operation, duration) => {
    req.performanceMetrics.operations[operation] = duration;
  };
  
  // Helper function to track memory usage
  req.trackMemory = (operation) => {
    const current = process.memoryUsage().heapUsed;
    const delta = current - req.performanceMetrics.memory.start;
    req.performanceMetrics.memory[operation] = {
      current: Math.round(current / 1024 / 1024), // MB
      delta: Math.round(delta / 1024 / 1024) // MB
    };
  };
  
  res.on('finish', () => {
    const total = Date.now() - start;
    const metrics = req.performanceMetrics;
    const finalMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    
    // Log performance metrics
    const logData = {
      method: req.method,
      path: req.path,
      duration: total,
      operations: metrics.operations,
      memoryUsage: finalMemory,
      statusCode: res.statusCode
    };
    
    // Log slow requests
    if (total > 2000) {
      logger.warn(`🐌 SLOW REQUEST: ${req.method} ${req.path} - ${total}ms`, logData);
    } else if (total > 1000) {
      logger.info(`⚠️ MODERATE REQUEST: ${req.method} ${req.path} - ${total}ms`, logData);
    }
    
    // Track specific operation performance
    if (metrics.operations.task_inference && metrics.operations.task_inference > 100) {
      logger.warn(`🐌 Slow task inference: ${metrics.operations.task_inference}ms`);
    }
    
    if (metrics.operations.emotion_logging && metrics.operations.emotion_logging > 50) {
      logger.warn(`🐌 Slow emotion logging: ${metrics.operations.emotion_logging}ms`);
    }
    
    if (metrics.operations.string_sanitization && metrics.operations.string_sanitization > 20) {
      logger.warn(`🐌 Slow string sanitization: ${metrics.operations.string_sanitization}ms`);
    }
    
    // Track analytics for slow operations
    if (total > 1000) {
      AnalyticsService.trackEvent(
        'performance_metric',
        'performance',
        {
          operation: 'request_processing',
          duration: total,
          path: req.path,
          operations: metrics.operations,
          memoryUsage: finalMemory
        }
      );
    }
  });
  
  next();
};

// Middleware specifically for completion endpoint monitoring
export const completionPerformanceMiddleware = (req, res, next) => {
  // Add completion-specific tracking
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    req.trackMemory('completion_end');
    originalSend.call(this, data);
  };
  
  res.json = function(data) {
    req.trackMemory('completion_end');
    originalJson.call(this, data);
  };
  
  next();
};

// Helper function to track database operations
export const trackDatabaseOperation = async (operation, operationFn, req = null) => {
  const start = Date.now();
  try {
    const result = await operationFn();
    const duration = Date.now() - start;
    
    if (req && req.trackOperation) {
      req.trackOperation(`db_${operation}`, duration);
    }
    
    if (duration > 200) {
      logger.warn(`🐌 Slow database operation: ${operation} - ${duration}ms`);
      
      // Track slow database operations
      AnalyticsService.trackEvent(
        'performance_metric',
        'performance',
        {
          operation: `database_${operation}`,
          duration,
          type: 'slow_query'
        }
      );
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`❌ Database operation failed: ${operation} - ${duration}ms`, {
      error: error.message,
      operation
    });
    throw error;
  }
};

// Helper function to track task inference performance
export const trackTaskInference = (req, operationFn) => {
  const start = Date.now();
  try {
    const result = operationFn();
    const duration = Date.now() - start;
    
    if (req && req.trackOperation) {
      req.trackOperation('task_inference', duration);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`❌ Task inference failed - ${duration}ms`, {
      error: error.message
    });
    throw error;
  }
};

// Helper function to track emotion logging performance
export const trackEmotionLogging = (req, operationFn) => {
  const start = Date.now();
  try {
    const result = operationFn();
    const duration = Date.now() - start;
    
    if (req && req.trackOperation) {
      req.trackOperation('emotion_logging', duration);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`❌ Emotion logging failed - ${duration}ms`, {
      error: error.message
    });
    throw error;
  }
};

// Helper function to track string sanitization performance
export const trackStringSanitization = (req, operationFn) => {
  const start = Date.now();
  try {
    const result = operationFn();
    const duration = Date.now() - start;
    
    if (req && req.trackOperation) {
      req.trackOperation('string_sanitization', duration);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`❌ String sanitization failed - ${duration}ms`, {
      error: error.message
    });
    throw error;
  }
};