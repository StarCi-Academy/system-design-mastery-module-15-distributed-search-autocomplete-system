-- Bootstrap the pgvector schema before the service connects.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id        TEXT PRIMARY KEY,
    content   TEXT NOT NULL,
    embedding vector(384) NOT NULL
);

-- HNSW index using the cosine operator class, matching the <=> query operator.
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw
    ON documents USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
