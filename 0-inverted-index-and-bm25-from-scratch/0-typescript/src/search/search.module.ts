import { Module } from '@nestjs/common';
import { redisProvider } from './redis.provider';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

/** Wires the BM25 search service, its controller, and the Redis client. */
@Module({
  controllers: [SearchController],
  providers: [redisProvider, SearchService],
})
export class SearchModule {}
