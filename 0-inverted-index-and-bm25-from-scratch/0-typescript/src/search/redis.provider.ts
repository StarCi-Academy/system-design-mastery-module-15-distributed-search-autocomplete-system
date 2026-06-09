import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** DI token for the shared ioredis client. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/** Build a single ioredis client from the redis config namespace. */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    return new Redis({
      host: config.get<string>('redis.host', 'localhost'),
      port: config.get<number>('redis.port', 6379),
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
  },
};
