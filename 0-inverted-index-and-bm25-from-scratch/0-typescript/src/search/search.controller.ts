import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IndexDocumentDto } from './dto';
import { SearchService } from './search.service';

/** REST surface for the BM25 inverted-index service. */
@Controller('api/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  // POST /api/search/index -> 201 { id, indexed: true }
  @Post('index')
  async index(@Body() dto: IndexDocumentDto): Promise<{ id: string; indexed: boolean }> {
    if (!dto?.id || !dto?.content) {
      throw new BadRequestException('id and content are required non-empty strings');
    }
    this.search.indexDocument(dto.id, dto.content);
    await this.search.saveSnapshot();
    return { id: dto.id, indexed: true };
  }

  // GET /api/search?q=...&limit=n -> 200 { query, hits }
  @Get()
  query(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ): { query: string; hits: ReturnType<SearchService['search']> } {
    const parsedLimit = Number(limit) > 0 ? Number(limit) : 5;
    const hits = this.search.search(q ?? '', parsedLimit);
    return { query: q ?? '', hits };
  }

  // GET /api/search/stats -> 200 { numDocs, vocabSize, avgdl }
  @Get('stats')
  stats(): { numDocs: number; vocabSize: number; avgdl: number } {
    return this.search.stats();
  }

  // DELETE /api/search/index/:id -> 200 { id, deleted }
  @Delete('index/:id')
  async remove(@Param('id') id: string): Promise<{ id: string; deleted: boolean }> {
    const deleted = this.search.removeDocument(id);
    await this.search.saveSnapshot();
    return { id, deleted };
  }

  // POST /api/search/reset -> 201 { reset: true }
  @Post('reset')
  async reset(): Promise<{ reset: boolean }> {
    this.search.reset();
    await this.search.saveSnapshot();
    return { reset: true };
  }
}
