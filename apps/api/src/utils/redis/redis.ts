import { Redis } from 'ioredis';
import { env } from '$src/config/env';

// Redis connection options with retry logic and error handling
const redisOptions = {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  retryDelayOnClusterDown: 100,
  lazyConnect: true,
  connectTimeout: 10000, // 10 seconds
  commandTimeout: 5000, // 5 seconds
  keepAlive: 30000, // 30 seconds
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
  retryDelayOnTryAgain: (times: number) => {
    return Math.min(times * 100, 3000); // Exponential backoff, max 3 seconds
  }
};

// Create Redis client with fallback for missing URL
export const redis = env.REDIS_URL ? new Redis(env.REDIS_URL, redisOptions) : null;

// Connection state tracking
let isRedisConnected = false;

if (redis) {
  redis.on('connect', () => {
    console.log('Redis connected successfully');
    isRedisConnected = true;
  });

  redis.on('ready', () => {
    console.log('Redis ready to receive commands');
    isRedisConnected = true;
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
    isRedisConnected = false;
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
    isRedisConnected = false;
  });

  redis.on('reconnecting', () => {
    console.log('Redis reconnecting...');
  });
}

// Health check function
export const isRedisHealthy = async (): Promise<boolean> => {
  if (!redis || !isRedisConnected) {
    return false;
  }

  try {
    await redis.ping();
    return true;
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
};
