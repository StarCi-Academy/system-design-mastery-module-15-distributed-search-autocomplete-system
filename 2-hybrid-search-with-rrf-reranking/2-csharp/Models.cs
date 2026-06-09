using System.Text.Json.Serialization;

namespace HybridSearchService;

/// <summary>A document as returned by an upstream engine.</summary>
public record UpstreamHit(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("content")] string Content,
    [property: JsonPropertyName("score")] double Score);

/// <summary>Raw upstream response body { mode, hits }.</summary>
public record UpstreamResponse(
    [property: JsonPropertyName("mode")] string Mode,
    [property: JsonPropertyName("hits")] List<UpstreamHit> Hits);

/// <summary>Per-source provenance ranks (null when absent in that list).</summary>
public class Sources
{
    [JsonPropertyName("bm25Rank")] public int? Bm25Rank { get; set; }
    [JsonPropertyName("vectorRank")] public int? VectorRank { get; set; }
}

/// <summary>A fused hit after RRF.</summary>
public class FusedHit
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("content")] public string Content { get; set; } = "";
    [JsonPropertyName("rrfScore")] public double RrfScore { get; set; }
    [JsonPropertyName("sources")] public Sources Sources { get; set; } = new();
}
