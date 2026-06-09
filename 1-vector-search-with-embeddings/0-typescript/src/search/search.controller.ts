import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
} from "@nestjs/common"
import { SearchService } from "./search.service"

interface IndexBody {
    id: string
    content: string
}

/**
 * REST surface for the vector-search demo. Every endpoint returns the same
 * JSON shape and HTTP status across all four language implementations.
 */
@Controller("api/search")
export class SearchController {
    constructor(private readonly search: SearchService) {}

    // GET /api/search?q=&limit= -> 200 { query, hits: [{ id, content, similarity }] }
    @Get()
    async query(@Query("q") q = "", @Query("limit") limit = "5") {
        const hits = await this.search.search(q, parseInt(limit, 10) || 5)
        return { query: q, hits }
    }

    // GET /api/search/stats -> 200 { documents, dimensions }
    @Get("stats")
    async stats() {
        return this.search.stats()
    }

    // POST /api/search/index -> 201 { id, indexed: true }
    @Post("index")
    @HttpCode(201)
    async index(@Body() body: IndexBody) {
        await this.search.index(body.id, body.content)
        return { id: body.id, indexed: true }
    }

    // DELETE /api/search/index/:id -> 200 { id, deleted: true }
    @Delete("index/:id")
    async remove(@Param("id") id: string) {
        await this.search.remove(id)
        return { id, deleted: true }
    }

    // POST /api/search/reset -> 200 { reset: true }
    @Post("reset")
    @HttpCode(200)
    async reset() {
        await this.search.reset()
        return { reset: true }
    }
}
