// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

// Response Messages
export const MESSAGES = {
  SUCCESS: 'success',
  ERROR: 'error',
  DEGRADED: 'degraded',
  USER_NOT_FOUND: 'User not found.',
  INVALID_TOKEN: 'Invalid or expired token.',
  UNAUTHORIZED: 'You are not logged in! Please log in to get access.',
  EMAIL_IN_USE: 'Email already in use.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  INVALID_PROMPT: 'Invalid or missing prompt.',
  SIGNUP_FAILED: 'Failed to create user.',
  LOGIN_FAILED: 'Login failed.',
  PROFILE_FETCH_FAILED: 'Failed to fetch profile.',
  HEALTH_CHECK_FAILED: 'Health check failed',
  VALIDATION_ERROR: 'Validation failed'
};

// Database Configuration
export const DB_CONFIG = {
  CONNECTION_POOL: {
    MAX_POOL_SIZE: 20, // Reduced from 50 for better resource management
    MIN_POOL_SIZE: 2, // Reduced from 5 for lighter footprint
    MAX_IDLE_TIME_MS: 20000, // Reduced from 30s for faster cleanup
    SERVER_SELECTION_TIMEOUT_MS: 3000, // Reduced from 5s for faster failover
    SOCKET_TIMEOUT_MS: 30000, // Reduced from 45s for faster detection
    HEARTBEAT_FREQUENCY_MS: 5000, // Increased from 10s for better monitoring
    BUFFER_MAX_ENTRIES: 0, // Disable buffering for immediate error detection
    CONNECT_TIMEOUT_MS: 10000, // 10 second connect timeout
    WRITE_CONCERN_TIMEOUT_MS: 5000 // 5 second write concern timeout
  },
  STATES: {
    DISCONNECTED: 'disconnected',
    CONNECTED: 'connected',
    CONNECTING: 'connecting',
    DISCONNECTING: 'disconnecting'
  }
};

// Task Configuration
export const TASK_CONFIG = {
  STATUSES: {
    QUEUED: 'queued',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },
  TYPES: {
    EMAIL_SUMMARY: 'email_summary',
    CALENDAR_REMINDER: 'calendar_reminder',
    TASK_REMINDER: 'task_reminder'
  },
  PRIORITIES: {
    LOW: 0,
    MEDIUM: 5,
    HIGH: 10
  }
};

// Memory and Performance Configuration (Relaxed for server stability)
export const MEMORY_CONFIG = {
  CACHE_TTL: 600000, // 10 minutes (increased - less aggressive cleanup)
  GC_THRESHOLD: 120000000, // 120MB (increased threshold)
  MEMORY_MONITORING_INTERVAL: 300000, // 5 minutes (much less frequent)
  MAX_RESPONSE_SIZE: 25000, // 25KB
  MAX_CACHE_SIZE: 300, // Increased cache size for better performance
  CACHE_CLEANUP_INTERVAL: 600000, // 10 minutes (much less frequent cleanup)
  HEAP_USAGE_THRESHOLD: 0.95, // 95% before cleanup (relaxed threshold)
  COMPRESSION_THRESHOLD: 512, // 512B compression
  FORCE_GC_THRESHOLD: 0.92, // Force GC at 92% (much more relaxed)
  LOW_MEMORY_MODE: false, // Disable aggressive memory conservation
  GC_COOLDOWN_MS: 120000 // 2 minutes cooldown (longer for stability)
};

// Security Configuration
export const SECURITY_CONFIG = {
  CORS_ORIGINS: [
    "https://numinaai.netlify.app",
    "http://localhost:5173",
    "http://localhost:5000",
    "https://aether-server-j5kh.onrender.com"
  ],
  RATE_LIMITS: {
    GENERAL: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // requests per windowMs
    },
    COMPLETION: {
      windowMs: 60 * 1000, // 1 minute
      max: 10 // requests per windowMs
    },
    COLLECTIVE_DATA: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 50 // requests per windowMs
    },
    SNAPSHOTS: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10 // requests per windowMs
    },
    EXPORT: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5 // requests per windowMs
    },
    ADMIN: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 20 // requests per windowMs
    },
    AGGREGATION: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 30 // requests per windowMs
    }
  },
  JWT_EXPIRES_IN: '1d',
  BCRYPT_ROUNDS: 12
};

// Logging Configuration
export const LOG_CONFIG = {
  LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug'
  },
  FORMATS: {
    TIMESTAMP: 'YYYY-MM-DD HH:mm:ss',
    COMBINED: 'combined',
    JSON: 'json'
  }
};