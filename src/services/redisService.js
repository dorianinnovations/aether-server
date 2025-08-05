/**
 * Redis Service Stub
 * Simple stub implementation for development/testing without Redis
 */

class RedisServiceStub {
  constructor() {
    this.cache = new Map();
    this.client = this;
  }

  async get(key) {
    return this.cache.get(key) || null;
  }

  async set(key, value, ttl = 300) {
    this.cache.set(key, value);
    
    // Simple TTL simulation
    if (ttl > 0) {
      setTimeout(() => {
        this.cache.delete(key);
      }, ttl * 1000);
    }
    
    return 'OK';
  }

  async del(key) {
    return this.cache.delete(key) ? 1 : 0;
  }

  async keys(pattern) {
    // Simple pattern matching for * wildcard
    const keys = Array.from(this.cache.keys());
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return keys.filter(key => regex.test(key));
    }
    return keys.filter(key => key === pattern);
  }

  async ttl(key) {
    return this.cache.has(key) ? 300 : -1; // Return default TTL if exists
  }

  async expire(key, seconds) {
    if (this.cache.has(key)) {
      setTimeout(() => {
        this.cache.delete(key);
      }, seconds * 1000);
      return 1;
    }
    return 0;
  }

  async zadd(key, score, member) {
    // Stub implementation for rate limiting
    return 1;
  }

  async zremrangebyscore(key, min, max) {
    // Stub implementation for rate limiting
    return 0;
  }

  async zcard(key) {
    // Stub implementation for rate limiting - return low count
    return 0;
  }

  async ping() {
    return 'PONG';
  }

  async quit() {
    this.cache.clear();
    return 'OK';
  }
}

const redisService = new RedisServiceStub();

export default redisService;