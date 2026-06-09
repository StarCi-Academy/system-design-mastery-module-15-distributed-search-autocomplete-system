import { Controller, Get, Query } from '@nestjs/common';
import { HybridSearchService } from './hybrid-search.service';

@Controller('api/search')
export class SearchController {
  constructor(private readonly search: HybridSearchService) {}

  @Get()
  async hybrid(@Query('q') q?: string, @Query('limit') limit = '10') {
    // The fused endpoint always reports mode "hybrid_rrf" plus per-source ranks.
    const hits = await this.search.search(q ?? '', Number(limit));
    return { mode: 'hybrid_rrf', hits };
  }

  @Get('bm25')
  async bm25(@Query('q') q?: string, @Query('limit') limit = '10') {
    // Pass-through to inspect the lexical engine in isolation.
    const hits = await this.search.passthrough(
      this.search.bm25,
      q ?? '',
      Number(limit),
    );
    return { mode: 'bm25', hits };
  }

  @Get('vector')
  async vector(@Query('q') q?: string, @Query('limit') limit = '10') {
    // Pass-through to inspect the semantic engine in isolation.
    const hits = await this.search.passthrough(
      this.search.vector,
      q ?? '',
      Number(limit),
    );
    return { mode: 'vector', hits };
  }
}
