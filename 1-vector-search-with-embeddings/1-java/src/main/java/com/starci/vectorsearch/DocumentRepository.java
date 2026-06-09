package com.starci.vectorsearch;

import jakarta.annotation.PostConstruct;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class DocumentRepository {

    private final JdbcTemplate jdbc;

    public DocumentRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    public void init() {
        // Enable pgvector, create the table, then build the HNSW cosine index.
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS vector");
        jdbc.execute("CREATE TABLE IF NOT EXISTS documents (" +
                "id TEXT PRIMARY KEY, content TEXT NOT NULL, embedding vector(384) NOT NULL)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS documents_embedding_hnsw " +
                "ON documents USING hnsw (embedding vector_cosine_ops)");
    }

    public void upsert(String id, String content, float[] embedding) {
        // pgvector accepts the literal "[0.1,0.2,...]"; cast to vector(384) on write.
        String literal = toVectorLiteral(embedding);
        jdbc.update(
                "INSERT INTO documents (id, content, embedding) VALUES (?, ?, ?::vector) " +
                "ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding",
                id, content, literal);
    }

    public List<Hit> search(float[] queryEmbedding, int limit) {
        String literal = toVectorLiteral(queryEmbedding);
        // <=> is pgvector's cosine-distance operator; HNSW index serves the ORDER BY.
        // similarity = 1 - distance so that "closer" => "higher score" for the client.
        return jdbc.query(
                "SELECT id, content, 1 - (embedding <=> ?::vector) AS similarity " +
                "FROM documents ORDER BY embedding <=> ?::vector LIMIT ?",
                (rs, i) -> new Hit(rs.getString("id"), rs.getString("content"), rs.getDouble("similarity")),
                literal, literal, limit);
    }

    public int count() {
        Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM documents", Integer.class);
        return n == null ? 0 : n;
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM documents WHERE id = ?", id);
    }

    public void reset() {
        jdbc.execute("TRUNCATE documents");
    }

    private String toVectorLiteral(float[] v) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) {
            if (i > 0) {
                sb.append(",");
            }
            sb.append(v[i]);
        }
        return sb.append("]").toString();
    }

    public record Hit(String id, String content, double similarity) {
    }
}
