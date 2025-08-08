import jwt from "jsonwebtoken";
import { env } from "../config/environment.js";
import { HTTP_STATUS, MESSAGES, SECURITY_CONFIG as _SECURITY_CONFIG } from "../config/constants.js";

// Authentication middleware initialized

// JWT signing function
export const signToken = (id) =>
  jwt.sign({ id }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

// JWT signing ready

// Middleware to protect routes
export const protect = (req, res, next) => {
  let token;
  
  // Check for token in authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // If no token, return unauthorized
  if (!token) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      status: MESSAGES.ERROR,
      message: MESSAGES.UNAUTHORIZED 
    });
  }

  try {
    
    // Verify token with JWT secret
    const decoded = jwt.verify(token, env.JWT_SECRET);
    
    // Handle both userId and id fields for backward compatibility
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      throw new Error('No user ID found in token');
    }
    
    req.user = { 
      id: userId,
      userId: userId,
      ...decoded 
    };
    next();
  } catch (error) {
    // Log the error for debugging but return generic message
    console.error("JWT verification failed:", error.message);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      status: MESSAGES.ERROR,
      message: MESSAGES.INVALID_TOKEN 
    });
  }
};

// Special middleware for token refresh that accepts expired tokens
export const protectRefresh = (req, res, next) => {
  let token;
  
  // Check for token in authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // If no token, return unauthorized
  if (!token) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      status: MESSAGES.ERROR,
      message: MESSAGES.UNAUTHORIZED 
    });
  }

  try {
    // Verify token with JWT secret, ignoring expiration
    const decoded = jwt.verify(token, env.JWT_SECRET, { ignoreExpiration: true });
    
    // Handle both userId and id fields for backward compatibility
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      throw new Error('No user ID found in token');
    }
    
    req.user = { 
      id: userId,
      userId: userId,
      ...decoded 
    };
    next();
  } catch (error) {
    // Log the error for debugging but return generic message
    console.error("JWT verification failed:", error.message);
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
      status: MESSAGES.ERROR,
      message: MESSAGES.INVALID_TOKEN 
    });
  }
};

// Middleware for internal/background operations that bypasses token auth
export const protectInternal = (req, res, next) => {
  // Check if this is an internal server call
  if (req.headers['x-internal-request'] === 'true' && req.headers['x-internal-secret'] === env.JWT_SECRET) {
    // For internal calls, extract user ID from header
    const userId = req.headers['x-user-id'];
    if (userId) {
      req.user = { 
        id: userId,
        userId: userId,
        internal: true
      };
      return next();
    }
  }
  
  // Fall back to regular auth
  return protect(req, res, next);
};

// Helper function to create internal request headers
export const createInternalHeaders = (userId) => ({
  'x-internal-request': 'true',
  'x-internal-secret': env.JWT_SECRET,
  'x-user-id': userId
});

// Middleware ready