// Simple in-memory cache for frequent requests
export const createCache = () => {
  const cache = {
    items: new Map(),
    maxSize: 100,
    ttl: 60 * 5 * 1000, // 5 minutes

    set(key, value, customTtl) {
      // Clean cache if it's getting too large
      if (this.items.size >= this.maxSize) {
        // Delete oldest items
        const keysToDelete = [...this.items.keys()].slice(0, 20);
        keysToDelete.forEach((k) => this.items.delete(k));
      }

      this.items.set(key, {
        value,
        expires: Date.now() + (customTtl || this.ttl),
      });
    },

    get(key) {
      const item = this.items.get(key);
      if (!item) return null;

      if (Date.now() > item.expires) {
        this.items.delete(key);
        return null;
      }

      return item.value;
    },
  };

  return cache;
};

// Memory monitoring utility
export const setupMemoryMonitoring = () => {
  setInterval(() => {
    const memUsage = process.memoryUsage();
    console.log(
      `Memory usage: ${Math.round(
        memUsage.rss / 1024 / 1024
      )}MB RSS, ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB Heap`
    );

    // Add GC hint if memory usage is high
    if (memUsage.heapUsed > 200 * 1024 * 1024) {
      // 200MB
      console.log("High memory usage detected, suggesting garbage collection");
      if (global.gc) {
        console.log("Running garbage collection");
        global.gc();
      }
    }
  }, 60 * 1000); // Check every minute
}; 