import { createCache } from '../../src/utils/cache.js';

describe('Cache Utility', () => {
  let cache;

  beforeEach(() => {
    cache = createCache();
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('test-key', 'test-value');
      const result = cache.get('test-key');
      expect(result).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      const result = cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should handle custom TTL', () => {
      cache.set('test-key', 'test-value', 1000); // 1 second
      const result = cache.get('test-key');
      expect(result).toBe('test-value');
    });

    it('should expire items after TTL', async () => {
      cache.set('test-key', 'test-value', 10); // 10ms
      await new Promise(resolve => setTimeout(resolve, 20));
      const result = cache.get('test-key');
      expect(result).toBeNull();
    });
  });

  describe('cache size management', () => {
    it('should limit cache size', () => {
      // Fill cache beyond max size
      for (let i = 0; i < 120; i++) {
        cache.set(`key-${i}`, `value-${i}`);
      }

      // Check that cache size is managed
      expect(cache.items.size).toBeLessThanOrEqual(100);
    });

    it('should remove oldest items when cache is full', () => {
      // Add items to fill cache
      for (let i = 0; i < 100; i++) {
        cache.set(`key-${i}`, `value-${i}`);
      }

      // Add one more to trigger cleanup
      cache.set('new-key', 'new-value');

      // Oldest items should be removed
      expect(cache.get('key-0')).toBeNull();
      expect(cache.get('new-key')).toBe('new-value');
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined values', () => {
      cache.set('null-key', null);
      cache.set('undefined-key', undefined);

      expect(cache.get('null-key')).toBeNull();
      expect(cache.get('undefined-key')).toBeUndefined();
    });

    it('should handle complex objects', () => {
      const complexObject = {
        nested: {
          array: [1, 2, 3],
          string: 'test'
        }
      };

      cache.set('complex-key', complexObject);
      const result = cache.get('complex-key');
      expect(result).toEqual(complexObject);
    });
  });
}); 