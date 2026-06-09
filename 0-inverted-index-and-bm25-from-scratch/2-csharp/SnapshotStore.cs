using System.Text.Json;
using StackExchange.Redis;

namespace Bm25SearchService;

/// <summary>Persists/restores the whole index as one JSON value under a single Redis key.</summary>
public class SnapshotStore
{
    private const string SnapshotKey = "bm25:index:snapshot";
    private readonly IConnectionMultiplexer? _redis;

    public SnapshotStore(string host, int port)
    {
        try
        {
            var options = new ConfigurationOptions
            {
                EndPoints = { { host, port } },
                AbortOnConnectFail = false,
                ConnectRetry = 3
            };
            _redis = ConnectionMultiplexer.Connect(options);
        }
        catch
        {
            _redis = null; // fall back to a pure in-memory index
        }
    }

    public void Save(Snapshot snap)
    {
        try
        {
            _redis?.GetDatabase().StringSet(SnapshotKey, JsonSerializer.Serialize(snap));
        }
        catch
        {
            // Redis outage -> keep serving from memory.
        }
    }

    public Snapshot? Load()
    {
        try
        {
            var raw = _redis?.GetDatabase().StringGet(SnapshotKey);
            if (raw is null || raw.Value.IsNullOrEmpty) return null;
            return JsonSerializer.Deserialize<Snapshot>(raw.Value!);
        }
        catch
        {
            return null;
        }
    }
}
