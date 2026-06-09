using HybridSearchService;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient<SearchOrchestrator>(c =>
{
    c.Timeout = TimeSpan.FromSeconds(2);
});

var app = builder.Build();

var port = Environment.GetEnvironmentVariable("PORT") ?? "3000";
app.Urls.Add($"http://0.0.0.0:{port}");

// GET /api/search?q=&limit= -> fused hybrid result.
app.MapGet("/api/search", async (string? q, int? limit, SearchOrchestrator orch) =>
{
    var hits = await orch.SearchAsync(q ?? "", limit ?? 10);
    return Results.Ok(new { mode = "hybrid_rrf", hits });
});

// Pass-through endpoints expose each upstream's raw ranked list { mode, hits }.
app.MapGet("/api/search/bm25", async (string? q, int? limit, SearchOrchestrator orch) =>
{
    var hits = await orch.PassthroughAsync(true, q ?? "", limit ?? 10);
    return Results.Ok(new { mode = "bm25", hits });
});

app.MapGet("/api/search/vector", async (string? q, int? limit, SearchOrchestrator orch) =>
{
    var hits = await orch.PassthroughAsync(false, q ?? "", limit ?? 10);
    return Results.Ok(new { mode = "vector", hits });
});

app.Run();
