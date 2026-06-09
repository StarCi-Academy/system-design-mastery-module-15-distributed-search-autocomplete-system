using Npgsql;
using Pgvector;
using VectorSearchService;

var builder = WebApplication.CreateBuilder(args);

var connString = Environment.GetEnvironmentVariable("DATABASE_URL")
                 ?? "Host=localhost;Port=5432;Username=search;Password=search;Database=vectorsearch";

var dataSourceBuilder = new NpgsqlDataSourceBuilder(connString);
dataSourceBuilder.UseVector();
var dataSource = dataSourceBuilder.Build();

builder.Services.AddSingleton(dataSource);
builder.Services.AddSingleton<EmbeddingService>();

var app = builder.Build();

// Idempotent schema bootstrap: extension + table + HNSW cosine index.
await using (var conn = await dataSource.OpenConnectionAsync())
{
    await new NpgsqlCommand("CREATE EXTENSION IF NOT EXISTS vector", conn).ExecuteNonQueryAsync();
    await new NpgsqlCommand(
        "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, content TEXT NOT NULL, embedding vector(384) NOT NULL)",
        conn).ExecuteNonQueryAsync();
    await new NpgsqlCommand(
        "CREATE INDEX IF NOT EXISTS documents_embedding_hnsw ON documents USING hnsw (embedding vector_cosine_ops)",
        conn).ExecuteNonQueryAsync();
}

// GET /api/search?q=&limit= -> 200 { query, hits: [{ id, content, similarity }] }
app.MapGet("/api/search", async (string? q, int? limit, NpgsqlDataSource db, EmbeddingService embedder) =>
{
    var query = q ?? "";
    var k = limit is > 0 ? limit.Value : 5;
    var vector = new Vector(embedder.Encode(query));

    await using var conn = await db.OpenConnectionAsync();
    // `<=>` is pgvector's cosine-distance operator; HNSW serves the ORDER BY.
    await using var cmd = new NpgsqlCommand(
        "SELECT id, content, 1 - (embedding <=> $1) AS similarity FROM documents ORDER BY embedding <=> $1 LIMIT $2",
        conn);
    cmd.Parameters.Add(new NpgsqlParameter { Value = vector });
    cmd.Parameters.AddWithValue(k);

    var hits = new List<object>();
    await using var reader = await cmd.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        hits.Add(new
        {
            id = reader.GetString(0),
            content = reader.GetString(1),
            similarity = reader.GetDouble(2),
        });
    }
    return Results.Ok(new { query, hits });
});

// GET /api/search/stats -> 200 { documents, dimensions }
app.MapGet("/api/search/stats", async (NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand("SELECT COUNT(*) FROM documents", conn);
    var count = Convert.ToInt32(await cmd.ExecuteScalarAsync());
    return Results.Ok(new { documents = count, dimensions = EmbeddingService.Dimensions });
});

// POST /api/search/index -> 201 { id, indexed: true }
app.MapPost("/api/search/index", async (IndexRequest req, NpgsqlDataSource db, EmbeddingService embedder) =>
{
    var vector = new Vector(embedder.Encode(req.Content));
    await using var conn = await db.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand(
        @"INSERT INTO documents (id, content, embedding) VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding",
        conn);
    cmd.Parameters.AddWithValue(req.Id);
    cmd.Parameters.AddWithValue(req.Content);
    cmd.Parameters.Add(new NpgsqlParameter { Value = vector });
    await cmd.ExecuteNonQueryAsync();
    return Results.Created($"/api/search/index/{req.Id}", new { id = req.Id, indexed = true });
});

// DELETE /api/search/index/{id} -> 200 { id, deleted: true }
app.MapDelete("/api/search/index/{id}", async (string id, NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand("DELETE FROM documents WHERE id = $1", conn);
    cmd.Parameters.AddWithValue(id);
    await cmd.ExecuteNonQueryAsync();
    return Results.Ok(new { id, deleted = true });
});

// POST /api/search/reset -> 200 { reset: true }
app.MapPost("/api/search/reset", async (NpgsqlDataSource db) =>
{
    await using var conn = await db.OpenConnectionAsync();
    await new NpgsqlCommand("TRUNCATE documents", conn).ExecuteNonQueryAsync();
    return Results.Ok(new { reset = true });
});

var port = Environment.GetEnvironmentVariable("PORT") ?? "3020";
app.Run($"http://0.0.0.0:{port}");

public record IndexRequest(string Id, string Content);
