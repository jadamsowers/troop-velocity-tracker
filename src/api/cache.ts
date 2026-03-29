const CACHE_KEY = 'scoutbook_roster_cache';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

export interface CacheEntry {
  data: any;
  timestamp: number;
}

export interface CacheData {
  [unitId: string]: CacheEntry;
}

export const cacheManager = {
  get: (unitId: string): any | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);
      const entry = cacheData[unitId];

      if (!entry) return null;

      const now = Date.now();
      const age = now - entry.timestamp;

      if (age > CACHE_TTL) {
        // Cache expired, remove it
        delete cacheData[unitId];
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
        return null;
      }

      return entry.data;
    } catch (e) {
      console.error('Failed to read cache:', e);
      return null;
    }
  },

  set: (unitId: string, data: any): void => {
    try {
      const cacheData: CacheData = (() => {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached) : {};
      })();

      cacheData[unitId] = {
        data,
        timestamp: Date.now(),
      };

      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
      console.error('Failed to write cache:', e);
    }
  },

  clear: (): void => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  },

  getCacheAge: (unitId: string): number | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);
      const entry = cacheData[unitId];

      if (!entry) return null;

      const now = Date.now();
      const age = now - entry.timestamp;

      if (age > CACHE_TTL) return null;

      return Math.floor(age / 1000); // return age in seconds
    } catch (e) {
      return null;
    }
  },

  getCacheTimestamp: (unitId: string): Date | null => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return null;

      const cacheData: CacheData = JSON.parse(cached);
      const entry = cacheData[unitId];

      if (!entry) return null;

      const now = Date.now();
      const age = now - entry.timestamp;

      if (age > CACHE_TTL) return null;

      return new Date(entry.timestamp);
    } catch (e) {
      return null;
    }
  },
};
