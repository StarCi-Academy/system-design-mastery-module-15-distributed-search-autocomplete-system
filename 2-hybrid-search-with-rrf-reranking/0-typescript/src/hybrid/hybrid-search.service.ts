import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fuseByRrf } from './rrf';
import { FusedHit, UpstreamHit } from './types';

@Injectable()
export class HybridSearchService {
  private readonly bm25Url: string;
  private readonly vectorUrl: string;
  private readonly rrfK: number;

  constructor(config: ConfigService) {
    this.bm25Url = config.get<string>('app.bm25Url')!;
    this.vectorUrl = config.get<string>('app.vectorUrl')!;
    this.rrfK = config.get<number>('app.rrfK', 60);
  }

  /**
   * Fan out to both engines IN PARALLEL: total latency ~= max(bm25, vector), not
   * the sum. Each call has its own .catch so one failure cannot reject the whole
   * Promise.all — a failed upstream degrades to an empty list and RRF fuses whatever
   * survives instead of crashing the request.
   */
  async search(q: string, limit: number): Promise<FusedHit[]> {
    const fetchSize = Math.max(limit * 2, limit); // over-fetch so consensus docs are not truncated early.
    const [bm25List, vectorList] = await Promise.all([
      this.fetchRanked(this.bm25Url, q, fetchSize).catch(() => [] as UpstreamHit[]),
      this.fetchRanked(this.vectorUrl, q, fetchSize).catch(() => [] as UpstreamHit[]),
    ]);
    return fuseByRrf(bm25List, vectorList, this.rrfK, limit);
  }

  /** Pass-through to a single upstream; returns its untouched ranked list. */
  async passthrough(url: string, q: string, limit: number): Promise<UpstreamHit[]> {
    return this.fetchRanked(url, q, limit);
  }

  get bm25(): string {
    return this.bm25Url;
  }

  get vector(): string {
    return this.vectorUrl;
  }

  private async fetchRanked(
    url: string,
    q: string,
    limit: number,
  ): Promise<UpstreamHit[]> {
    const res = await fetch(
      `${url}?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`upstream ${url} returned ${res.status}`);
    const body = (await res.json()) as { hits: UpstreamHit[] };
    return body.hits ?? [];
  }
}
