import { registerAs } from '@nestjs/config';

/** Application-level configuration (HTTP port). */
export const appConfig = registerAs('app', () => ({
  port: Number(process.env.PORT) || 3000,
}));
