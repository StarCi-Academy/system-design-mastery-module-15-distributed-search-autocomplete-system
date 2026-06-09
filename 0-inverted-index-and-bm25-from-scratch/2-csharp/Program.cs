using Bm25SearchService;

var builder = WebApplication.CreateBuilder(args);

var redisHost = Environment.GetEnvironmentVariable("REDIS_HOST") ?? "localhost";
var redisPort = int.TryParse(Environment.GetEnvironmentVariable("REDIS_PORT"), out var rp) ? rp : 6379;
var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
builder.WebHost.UseUrls($"http://+:{port}");

var store = new SnapshotStore(redisHost, redisPort);
var index = new InvertedIndex();
var bootSnap = store.Load(); // rebuild on boot
if (bootSnap is not null) index.FromSnapshot(bootSnap);

builder.Services.AddSingleton(index);
builder.Services.AddSingleton(store);

var app = builder.Build();

/// <summary>Request body for POST /api/search/index.</summary>
app.MapPost("/api/search/index", (IndexRequest req, InvertedIndex idx, SnapshotStore st) =>
{
    if (string.IsNullOrWhiteSpace(req.Id) || string.IsNullOrWhiteSpace(req.Content))
        return Results.BadRequest(new { error = "id and content are required non-empty strings" });
    idx.IndexDocument(req.Id, req.Content);
    st.Save(idx.ToSnapshot());
    return Results.Created($"/api/search/index/{req.Id}", new { id = req.Id, indexed = true });
});

app.MapGet("/api/search", (string? q, int? limit, InvertedIndex idx) =>
{
    var effective = limit is > 0 ? limit.Value : 5;
    return Results.Ok(new { query = q ?? "", hits = idx.Search(q ?? "", effective) });
});

app.MapGet("/api/search/stats", (InvertedIndex idx) => Results.Ok(idx.Stats()));

app.MapDelete("/api/search/index/{id}", (string id, InvertedIndex idx, SnapshotStore st) =>
{
    var deleted = idx.RemoveDocument(id);
    st.Save(idx.ToSnapshot());
    return Results.Ok(new { id, deleted });
});

app.MapPost("/api/search/reset", (InvertedIndex idx, SnapshotStore st) =>
{
    idx.Reset();
    st.Save(idx.ToSnapshot());
    return Results.Created("/api/search/reset", new { reset = true });
});

app.Run();

/// <summary>Request body for indexing a document.</summary>
public record IndexRequest(string Id, string Content);
