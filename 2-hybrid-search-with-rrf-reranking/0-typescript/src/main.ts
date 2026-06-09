import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/** Bootstrap the HTTP server on the configured port. */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`hybrid-search-service listening on :${port}`);
}

void bootstrap();
