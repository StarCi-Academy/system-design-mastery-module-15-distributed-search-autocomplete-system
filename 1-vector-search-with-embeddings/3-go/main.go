package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

const dimensions = 384

// Embedder turns text into a 384-dim L2-normalized vector. In production this
// wraps onnxruntime-go running all-MiniLM-L6-v2; here it is a deterministic
// feature-hashing stand-in so the service is self-contained for smoke tests.
type Embedder struct{}

func (e *Embedder) Embed(text string) []float32 {
	vec := make([]float32, dimensions)
	for i, r := range text {
		vec[(int(r)+i)%dimensions] += 1.0
	}
	return l2Normalize(vec)
}

func l2Normalize(v []float32) []float32 {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return v
	}
	norm := float32(1.0 / (sqrt(sum)))
	for i := range v {
		v[i] *= norm
	}
	return v
}

func sqrt(x float64) float64 {
	if x == 0 {
		return 0
	}
	z := x
	for i := 0; i < 40; i++ {
		z = (z + x/z) / 2
	}
	return z
}

type Repo struct {
	pool     *pgxpool.Pool
	embedder *Embedder
}

func (r *Repo) initSchema(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS vector`)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY, content TEXT NOT NULL, embedding vector(384) NOT NULL)`)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `CREATE INDEX IF NOT EXISTS documents_embedding_hnsw
		ON documents USING hnsw (embedding vector_cosine_ops)`)
	return err
}

func (r *Repo) Index(ctx context.Context, id, content string) error {
	emb := r.embedder.Embed(content)
	_, err := r.pool.Exec(ctx,
		`INSERT INTO documents (id, content, embedding) VALUES ($1, $2, $3)
		 ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`,
		id, content, pgvector.NewVector(emb))
	return err
}

type Hit struct {
	ID         string  `json:"id"`
	Content    string  `json:"content"`
	Similarity float64 `json:"similarity"`
}

func (r *Repo) Search(ctx context.Context, query string, limit int) ([]Hit, error) {
	qvec := r.embedder.Embed(query)
	rows, err := r.pool.Query(ctx,
		`SELECT id, content, 1 - (embedding <=> $1) AS similarity
		 FROM documents ORDER BY embedding <=> $1 LIMIT $2`,
		pgvector.NewVector(qvec), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	hits := []Hit{}
	for rows.Next() {
		var h Hit
		if err := rows.Scan(&h.ID, &h.Content, &h.Similarity); err != nil {
			return nil, err
		}
		hits = append(hits, h)
	}
	return hits, rows.Err()
}

func (r *Repo) Count(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM documents`).Scan(&n)
	return n, err
}

func (r *Repo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM documents WHERE id = $1`, id)
	return err
}

func (r *Repo) Reset(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `TRUNCATE documents`)
	return err
}

func main() {
	ctx := context.Background()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://search:search@localhost:5432/vectorsearch"
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	repo := &Repo{pool: pool, embedder: &Embedder{}}
	if err := repo.initSchema(ctx); err != nil {
		log.Fatal(err)
	}

	router := gin.Default()

	// GET /api/search?q=&limit= -> 200 { query, hits: [{ id, content, similarity }] }
	router.GET("/api/search", func(c *gin.Context) {
		q := c.Query("q")
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "5"))
		if limit <= 0 {
			limit = 5
		}
		hits, err := repo.Search(c, q, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"query": q, "hits": hits})
	})

	// GET /api/search/stats -> 200 { documents, dimensions }
	router.GET("/api/search/stats", func(c *gin.Context) {
		n, err := repo.Count(c)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"documents": n, "dimensions": dimensions})
	})

	// POST /api/search/index -> 201 { id, indexed: true }
	router.POST("/api/search/index", func(c *gin.Context) {
		var body struct {
			ID      string `json:"id"`
			Content string `json:"content"`
		}
		if err := c.BindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := repo.Index(c, body.ID, body.Content); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"id": body.ID, "indexed": true})
	})

	// DELETE /api/search/index/:id -> 200 { id, deleted: true }
	router.DELETE("/api/search/index/:id", func(c *gin.Context) {
		id := c.Param("id")
		if err := repo.Delete(c, id); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": id, "deleted": true})
	})

	// POST /api/search/reset -> 200 { reset: true }
	router.POST("/api/search/reset", func(c *gin.Context) {
		if err := repo.Reset(c); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"reset": true})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3020"
	}
	log.Printf("vector-search-service listening on :%s", port)
	if err := router.Run("0.0.0.0:" + port); err != nil {
		log.Fatal(err)
	}
}
