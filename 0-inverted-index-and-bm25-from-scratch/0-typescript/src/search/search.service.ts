import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

/** Redis key holding the single JSON snapshot of the whole index. */
const SNAPSHOT_KEY = 'bm25:index:snapshot';

/** A document stored in the index. */
interface DocRecord {
  content: string;
  length: number;
}

/** One search hit returned to the client. */
export interface SearchHit {
  id: string;
  score: number;
  content: string;
}

/**
 * In-memory inverted index with BM25 scoring.
 * The whole structure is serialized to one JSON blob in Redis on every write,
 * and rebuilt from that blob on boot, so ranking survives a restart.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  // term -> (docId -> term frequency within that document)
  private readonly index = new Map<string, Map<string, number>>();
  // docId -> { content, length }
  private readonly docs = new Map<string, DocRecord>();
  // sum of all document lengths, used to derive avgdl
  private totalLength = 0;

  private readonly k1 = 1.2; // controls how fast tf saturates (diminishing returns)
  private readonly b = 0.75; // controls how strongly document length is normalized

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Rebuild the in-memory index from the Redis snapshot once on boot. */
  async onModuleInit(): Promise<void> {
    await this.loadSnapshot();
  }

  // Lowercase + split on non-alphanumeric so "Redis-Cluster!" -> ["redis","cluster"].
  // Identical tokenization MUST run at both index time and query time, otherwise
  // a query term would never match its indexed form.
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0);
  }

  indexDocument(id: string, content: string): void {
    this.removeDocument(id); // re-indexing the same id must not double-count terms
    const terms = this.tokenize(content);
    this.docs.set(id, { content, length: terms.length });
    this.totalLength += terms.length;

    // Count term frequency (tf) within THIS document.
    const tf = new Map<string, number>();
    for (const term of terms) tf.set(term, (tf.get(term) ?? 0) + 1);

    // For each term, append { id, tf } to its posting list.
    // The posting list is the inverted index: term -> documents that contain it,
    // so a query reads only the few posting lists it needs, never every document.
    for (const [term, freq] of tf) {
      let postings = this.index.get(term);
      if (!postings) {
        postings = new Map();
        this.index.set(term, postings);
      }
      postings.set(id, freq);
    }
  }

  /** Remove a document and prune any term whose posting list becomes empty. */
  removeDocument(id: string): boolean {
    const doc = this.docs.get(id);
    if (!doc) return false;
    this.totalLength -= doc.length;
    this.docs.delete(id);
    for (const [term, postings] of this.index) {
      if (postings.delete(id) && postings.size === 0) {
        this.index.delete(term); // orphaned term -> prune so vocabSize stays accurate
      }
    }
    return true;
  }

  // IDF: rare terms weigh more than common terms.
  // "failover" appearing in 1 of N docs beats "the" appearing in all N.
  private idf(term: string): number {
    const n = this.index.get(term)?.size ?? 0; // docs containing the term
    const N = this.docs.size; // total docs
    if (n === 0) return 0;
    return Math.log(1 + (N - n + 0.5) / (n + 0.5));
  }

  // BM25 score of one document for one term.
  private bm25Term(term: string, docId: string): number {
    const tf = this.index.get(term)?.get(docId) ?? 0;
    if (tf === 0) return 0;
    const dl = this.docs.get(docId)!.length;
    const avgdl = this.totalLength / this.docs.size;
    // numerator saturates tf; denominator normalizes by document length vs avgdl.
    const numerator = tf * (this.k1 + 1);
    const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / avgdl));
    return this.idf(term) * (numerator / denominator);
  }

  /** Rank documents for a query by summing the BM25 contribution of each query term. */
  search(query: string, limit: number): SearchHit[] {
    const terms = this.tokenize(query);
    if (terms.length === 0 || this.docs.size === 0) return [];

    const scores = new Map<string, number>();
    for (const term of terms) {
      const postings = this.index.get(term);
      if (!postings) continue;
      for (const docId of postings.keys()) {
        scores.set(docId, (scores.get(docId) ?? 0) + this.bm25Term(term, docId));
      }
    }

    return [...scores.entries()]
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        id,
        score,
        content: this.docs.get(id)!.content,
      }));
  }

  /** Corpus statistics that BM25 depends on. */
  stats(): { numDocs: number; vocabSize: number; avgdl: number } {
    const numDocs = this.docs.size;
    return {
      numDocs,
      vocabSize: this.index.size,
      avgdl: numDocs === 0 ? 0 : this.totalLength / numDocs,
    };
  }

  /** Clear the whole index and persist the empty state. */
  reset(): void {
    this.index.clear();
    this.docs.clear();
    this.totalLength = 0;
  }

  // Serialize the whole in-memory index into one plain-JSON blob.
  // Map is not JSON-serializable, so we flatten postings to [id, tf] tuples.
  private serialize(): string {
    const indexObj: Record<string, [string, number][]> = {};
    for (const [term, postings] of this.index) indexObj[term] = [...postings];
    const docsObj: Record<string, DocRecord> = {};
    for (const [id, d] of this.docs) docsObj[id] = d;
    return JSON.stringify({
      index: indexObj,
      docs: docsObj,
      totalLength: this.totalLength,
    });
  }

  // Save on every write so the snapshot is always current.
  async saveSnapshot(): Promise<void> {
    try {
      await this.redis.set(SNAPSHOT_KEY, this.serialize());
    } catch {
      // Redis unreachable -> fall back to a pure in-memory index (no client-facing error).
    }
  }

  // Called once on application boot (OnModuleInit): rebuild memory from Redis.
  async loadSnapshot(): Promise<void> {
    let raw: string | null = null;
    try {
      raw = await this.redis.get(SNAPSHOT_KEY);
    } catch {
      return; // empty / unreachable store -> start with an empty index
    }
    if (!raw) return;
    const snap = JSON.parse(raw) as {
      index: Record<string, [string, number][]>;
      docs: Record<string, DocRecord>;
      totalLength: number;
    };
    this.totalLength = snap.totalLength;
    for (const [id, d] of Object.entries(snap.docs)) this.docs.set(id, d);
    for (const [term, postings] of Object.entries(snap.index)) {
      this.index.set(term, new Map(postings));
    }
  }
}
