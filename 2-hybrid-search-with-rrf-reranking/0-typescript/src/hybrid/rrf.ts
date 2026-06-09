import { FusedHit, UpstreamHit } from './types';

/**
 * Reciprocal Rank Fusion (Cormack et al., 2009).
 *
 * For every list, a document at 1-based rank `r` contributes `1 / (k + r)`. The
 * contributions are SUMMED across lists per document, so a document ranked decently
 * in BOTH lists collects two terms and rises above a document ranked first in only
 * one list. The formula reads only `rank` — the raw BM25 and cosine scores never
 * meet, so no score normalization is needed.
 */
export function fuseByRrf(
  bm25: UpstreamHit[],
  vector: UpstreamHit[],
  k: number,
  limit: number,
): FusedHit[] {
  const acc = new Map<string, FusedHit>();

  const accumulate = (list: UpstreamHit[], isBm25: boolean): void => {
    list.forEach((hit, idx) => {
      const rank = idx + 1; // 1-based: the first element has rank 1.
      const contribution = 1 / (k + rank);
      const existing = acc.get(hit.id);
      if (existing) {
        // A doc present in BOTH lists accumulates two contributions -> consensus boost.
        existing.rrfScore += contribution;
        if (isBm25) existing.sources.bm25Rank = rank;
        else existing.sources.vectorRank = rank;
      } else {
        acc.set(hit.id, {
          id: hit.id,
          content: hit.content,
          rrfScore: contribution,
          sources: {
            bm25Rank: isBm25 ? rank : null,
            vectorRank: isBm25 ? null : rank,
          },
        });
      }
    });
  };

  accumulate(bm25, true);
  accumulate(vector, false);

  // Sort by fused score descending; consensus documents naturally rise to the top.
  return [...acc.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, limit);
}
