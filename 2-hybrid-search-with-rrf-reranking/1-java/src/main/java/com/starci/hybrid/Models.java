package com.starci.hybrid;

import java.util.List;

/** Shared DTOs for the hybrid search contract. */
public final class Models {
    private Models() {}

    /** A document as returned by an upstream engine. */
    public record Doc(String id, String content, double score) {}

    /** Raw upstream response body { mode, hits }. */
    public record UpstreamResponse(String mode, List<Doc> hits) {}

    /** Per-source provenance ranks (null when absent in that list). */
    public record Sources(Integer bm25Rank, Integer vectorRank) {}

    /** A fused hit after RRF. */
    public record Hit(String id, String content, double rrfScore, Sources sources) {}

    /** Fused endpoint response. */
    public record SearchResponse(String mode, List<Hit> hits) {}

    /** Pass-through endpoint response { mode, hits }. */
    public record PassthroughResponse(String mode, List<Doc> hits) {}
}
