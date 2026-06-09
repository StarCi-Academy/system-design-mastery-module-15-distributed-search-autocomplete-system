import { registerAs } from '@nestjs/config';

/** Redis connection configuration for the snapshot store. */
export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
}));
