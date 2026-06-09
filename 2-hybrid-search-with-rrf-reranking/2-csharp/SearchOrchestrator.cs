using System.Net.Http.Json;

namespace HybridSearchService;

/// <summary>
/// Parallel fan-out to the BM25 and vector upstreams + in-process Reciprocal Rank
/// Fusion (k=60). Each upstream call is failure-isolated: a dead upstream degrades
/// to an empty list instead of crashing the request.
/// </summary>
public class SearchOrchestrator
{
    private readonly HttpClient _http;
    private readonly string _bm25Url;
    private readonly string _vectorUrl;
    private readonly int _rrfK;

    public SearchOrchestrator(HttpClient http, IConfiguration config)
    {
        _http = http;
        _bm25Url = config["BM25_URL"] ?? "http://bm25-service:4001/search";
        _vectorUrl = config["VECTOR_URL"] ?? "http://vector-service:4002/search";
        _rrfK = int.TryParse(config["RRF_K"], out var k) ? k : 60;
    }

    private async Task<List<UpstreamHit>> SafeQueryAsync(string baseUrl, string q, int limit)
    {
        try
        {
            var url = $"{baseUrl}?q={Uri.EscapeDataString(q)}&limit={limit}";
            var body = await _http.GetFromJsonAsync<UpstreamResponse>(url);
            return body?.Hits ?? new List<UpstreamHit>();
        }
        catch (Exception)
        {
            // Failure isolation: a dead upstream contributes nothing, not an exception.
            return new List<UpstreamHit>();
        }
    }

    public async Task<List<FusedHit>> SearchAsync(string q, int limit)
    {
        var fetchSize = Math.Max(limit * 2, limit);
        // Task.WhenAll runs both upstream calls concurrently, like Promise.all in TS.
        var bm25Task = SafeQueryAsync(_bm25Url, q, fetchSize);
        var vectorTask = SafeQueryAsync(_vectorUrl, q, fetchSize);
        await Task.WhenAll(bm25Task, vectorTask);
        return Fuse(bm25Task.Result, vectorTask.Result).Take(limit).ToList();
    }

    public Task<List<UpstreamHit>> PassthroughAsync(bool isBm25, string q, int limit) =>
        SafeQueryAsync(isBm25 ? _bm25Url : _vectorUrl, q, limit);

    private List<FusedHit> Fuse(List<UpstreamHit> bm25, List<UpstreamHit> vector)
    {
        var acc = new Dictionary<string, FusedHit>();

        void Accumulate(List<UpstreamHit> list, bool isBm25)
        {
            for (int i = 0; i < list.Count; i++)
            {
                int rank = i + 1; // 1-based rank, NOT the raw score
                var hit = list[i];
                if (!acc.TryGetValue(hit.Id, out var fused))
                {
                    fused = new FusedHit { Id = hit.Id, Content = hit.Content };
                    acc[hit.Id] = fused;
                }
                // A document present in BOTH lists accumulates 1/(k+rank) twice -> consensus boost.
                fused.RrfScore += 1.0 / (_rrfK + rank);
                if (isBm25) fused.Sources.Bm25Rank = rank;
                else fused.Sources.VectorRank = rank;
            }
        }

        Accumulate(bm25, true);
        Accumulate(vector, false);

        return acc.Values.OrderByDescending(h => h.RrfScore).ToList();
    }
}
