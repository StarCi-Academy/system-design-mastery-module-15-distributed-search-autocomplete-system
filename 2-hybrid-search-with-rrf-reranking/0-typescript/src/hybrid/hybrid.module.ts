import { Module } from '@nestjs/common';
import { HybridSearchService } from './hybrid-search.service';
import { SearchController } from './search.controller';

@Module({
  controllers: [SearchController],
  providers: [HybridSearchService],
})
export class HybridModule {}
