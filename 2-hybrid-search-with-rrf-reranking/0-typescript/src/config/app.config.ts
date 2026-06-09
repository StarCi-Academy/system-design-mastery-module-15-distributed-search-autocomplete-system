import { registerAs } from '@nestjs/config';

/** Orchestrator runtime configuration: listen port, upstream URLs, and the RRF constant k. */
export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  bm25Url: process.env.BM25_URL ?? 'http://bm25-service:4001/search',
  vectorUrl: process.env.VECTOR_URL ?? 'http://vector-service:4002/search',
  rrfK: parseInt(process.env.RRF_K ?? '60', 10),
}));
