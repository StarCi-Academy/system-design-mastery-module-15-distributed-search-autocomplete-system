import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, redisConfig } from './config';
import { SearchModule } from './search';

/** Root module: loads config namespaces and the search feature. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, redisConfig],
    }),
    SearchModule,
  ],
})
export class AppModule {}
