// Normalized logger - works everywhere
const out = {
  info: (...a) => console.log('[INFO]', ...a),
  warn: (...a) => console.warn('[WARN]', ...a), 
  error: (...a) => console.error('[ERROR]', ...a),
  debug: (...a) => (process.env.DEBUG ? console.log('[DEBUG]', ...a) : null),
  database: (...a) => console.log('[DB]', ...a),
  api: (...a) => console.log('[API]', ...a),
};

export const log = out;
export default out;

// Keep existing exports for compatibility
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const originalJson = res.json;
  
  res.json = function(data) {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
    return originalJson.call(this, data);
  };
  
  next();
};

export const errorLogger = (err, req, res, next) => {
  console.error('[ERROR]', err.message);
  next(err);
};

export const globalErrorHandler = (err, req, res, next) => {
  console.error('[GLOBAL ERROR]', err);
  
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
};