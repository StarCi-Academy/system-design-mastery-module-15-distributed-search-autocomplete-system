import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Bootstrap the HTTP server on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  // Bind to 0.0.0.0 so the container port is reachable from the Docker host.
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`bm25-search-service listening on :${port}`);
}

void bootstrap();
