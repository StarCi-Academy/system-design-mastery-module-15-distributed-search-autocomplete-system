import { NestFactory } from "@nestjs/core"
import { ConfigService } from "@nestjs/config"
import { AppModule } from "./app.module"

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule)
    const config = app.get(ConfigService)
    const port = config.get<number>("app.port") ?? 3020
    await app.listen(port, "0.0.0.0")
    // eslint-disable-next-line no-console
    console.log(`vector-search-service listening on :${port}`)
}

void bootstrap()
