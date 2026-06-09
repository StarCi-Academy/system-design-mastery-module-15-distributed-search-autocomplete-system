import { Module } from "@nestjs/common"
import { EmbeddingService } from "./embedding.service"
import { pgPoolProvider } from "./pg.provider"
import { SearchController } from "./search.controller"
import { SearchService } from "./search.service"

@Module({
    controllers: [SearchController],
    providers: [pgPoolProvider, EmbeddingService, SearchService],
})
export class SearchModule {}
