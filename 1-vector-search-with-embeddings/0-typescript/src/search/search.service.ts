import { Inject, Injectable, OnModuleInit } from "@nestjs/common"
import { Pool } from "pg"
import { EmbeddingService } from "./embedding.service"
import { PG_POOL } from "./pg.provider"

export interface SearchHit {
    id: string
    content: string
    similarity: number
}

const DIMENSIONS = 384

@Injectable()
export class SearchService implements OnModuleInit {
    constructor(
        @Inject(PG_POOL) private readonly pool: Pool,
        private readonly embedding: EmbeddingService,
    ) {}

    async onModuleInit(): Promise<void> {
        // Idempotent schema bootstrap: extension + table + HNSW cosine index.
        await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector")
        await this.pool.query(
            `CREATE TABLE IF NOT EXISTS documents (
                id        TEXT PRIMARY KEY,
                content   TEXT NOT NULL,
                embedding vector(${DIMENSIONS}) NOT NULL
            )`,
        )
        await this.pool.query(
            `CREATE INDEX IF NOT EXISTS documents_embedding_hnsw
             ON documents USING hnsw (embedding vector_cosine_ops)
             WITH (m = 16, ef_construction = 64)`,
        )
    }

    async index(id: string, content: string): Promise<void> {
        // Turn the document text into a 384-dim embedding at write time.
        const embedding = await this.embedding.embed(content)
        // pgvector accepts the vector as a "[v0,v1,...]" literal string.
        const literal = `[${embedding.join(",")}]`
        await this.pool.query(
            `INSERT INTO documents (id, content, embedding)
             VALUES ($1, $2, $3::vector)
             ON CONFLICT (id) DO UPDATE
               SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
            [id, content, literal],
        )
    }

    async search(query: string, limit: number): Promise<SearchHit[]> {
        // Embed the query in the SAME space as the documents.
        const embedding = await this.embedding.embed(query)
        const literal = `[${embedding.join(",")}]`
        // "<=>" is pgvector's cosine-distance operator (0 = identical direction).
        // similarity = 1 - distance, so higher means more semantically related.
        const { rows } = await this.pool.query(
            `SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
             FROM documents
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [literal, limit],
        )
        return rows.map((r) => ({
            id: r.id,
            content: r.content,
            similarity: Number(r.similarity),
        }))
    }

    async stats(): Promise<{ documents: number; dimensions: number }> {
        const { rows } = await this.pool.query("SELECT COUNT(*)::int AS documents FROM documents")
        return { documents: rows[0].documents, dimensions: DIMENSIONS }
    }

    async remove(id: string): Promise<boolean> {
        const { rowCount } = await this.pool.query("DELETE FROM documents WHERE id = $1", [id])
        return rowCount > 0
    }

    async reset(): Promise<void> {
        await this.pool.query("TRUNCATE documents")
    }
}
