import mongoose from "mongoose";
import { env } from "./environment.js";
import { DB_CONFIG } from "./constants.js";
import { log } from "../utils/logger.js";

// Optimized Database Connection with enhanced pool settings
const connectDB = async () => {
  try {
    // Attempting MongoDB connection
    log.debug("Using optimized connection pool settings");
    
    await mongoose.connect(env.MONGO_URI, {
      // Use centralized connection pool settings
      maxPoolSize: DB_CONFIG.CONNECTION_POOL.MAX_POOL_SIZE,
      minPoolSize: DB_CONFIG.CONNECTION_POOL.MIN_POOL_SIZE,
      maxIdleTimeMS: DB_CONFIG.CONNECTION_POOL.MAX_IDLE_TIME_MS,
      serverSelectionTimeoutMS: DB_CONFIG.CONNECTION_POOL.SERVER_SELECTION_TIMEOUT_MS,
      socketTimeoutMS: DB_CONFIG.CONNECTION_POOL.SOCKET_TIMEOUT_MS,
      connectTimeoutMS: DB_CONFIG.CONNECTION_POOL.CONNECT_TIMEOUT_MS,
      family: 4, // Use IPv4, avoid slow IPv6 lookups
      bufferCommands: false, // Disable mongoose buffering for better performance
      heartbeatFrequencyMS: DB_CONFIG.CONNECTION_POOL.HEARTBEAT_FREQUENCY_MS,
      retryReads: true, // Enable read retries
      retryWrites: true, // Enable write retries
      compressors: ['zlib'], // Enable compression for network traffic
      zlibCompressionLevel: 6, // Balanced compression level
      writeConcern: {
        w: 'majority',
        wtimeout: DB_CONFIG.CONNECTION_POOL.WRITE_CONCERN_TIMEOUT_MS
      },
      readPreference: 'primary', // Ensure consistent reads
      autoIndex: env.NODE_ENV === 'development', // Only auto-create indexes in dev
      maxConnecting: 2 // Limit concurrent connection attempts
    });
    
    // MongoDB connected
    
    // Log connection pool events for monitoring
    mongoose.connection.on('connected', () => {
      log.info('MongoDB connection established');
    });
    
    mongoose.connection.on('error', (err) => {
      log.error('MongoDB connection error', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      log.warn('MongoDB disconnected');
    });
    
    // Monitor connection pool
    mongoose.connection.on('fullsetup', () => {
      log.info('MongoDB replica set connected');
    });
    
    // Database connection monitoring configured
    
  } catch (err) {
    log.error("MongoDB connection error", err);
    if (env.NODE_ENV !== 'test') {
      process.exit(1); // Only exit in non-test environments
    } else {
      throw err; // Let the test fail naturally
    }
  }
};

// Connection health check function
export const checkDBHealth = () => {
  const state = mongoose.connection.readyState;
  const states = {
    0: DB_CONFIG.STATES.DISCONNECTED,
    1: DB_CONFIG.STATES.CONNECTED,
    2: DB_CONFIG.STATES.CONNECTING,
    3: DB_CONFIG.STATES.DISCONNECTING
  };
  
  return {
    state: states[state] || 'unknown',
    readyState: state,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    name: mongoose.connection.name
  };
};

// Graceful shutdown
export const gracefulShutdown = async () => {
  try {
    await mongoose.connection.close();
    log.info('MongoDB connection closed gracefully');
  } catch (err) {
    log.error('Error closing MongoDB connection', err);
  }
};

export default connectDB; 