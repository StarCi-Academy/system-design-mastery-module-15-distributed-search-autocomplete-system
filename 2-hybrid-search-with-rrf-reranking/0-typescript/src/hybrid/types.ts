/** A document as returned by an upstream search engine (lexical or semantic). */
export interface UpstreamHit {
  id: string;
  content: string;
  score: number;
}

/** Per-source provenance: the 1-based rank of a document in each upstream list, or null if absent. */
export interface Sources {
  bm25Rank: number | null;
  vectorRank: number | null;
}

/** A fused hit after Reciprocal Rank Fusion. */
export interface FusedHit {
  id: string;
  content: string;
  rrfScore: number;
  sources: Sources;
}
