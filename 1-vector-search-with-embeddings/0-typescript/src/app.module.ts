import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { appConfig, pgConfig } from "./config"
import { SearchModule } from "./search"

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [appConfig, pgConfig],
        }),
        SearchModule,
    ],
})
export class AppModule {}
