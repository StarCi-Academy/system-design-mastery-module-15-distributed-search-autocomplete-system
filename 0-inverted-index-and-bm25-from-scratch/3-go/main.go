package main

import (
	"context"
	"net/http"
	"os"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// indexRequest is the POST /api/search/index body.
type indexRequest struct {
	ID      string `json:"id"`
	Content string `json:"content"`
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	ctx := context.Background()
	rdb := redis.NewClient(&redis.Options{
		Addr: getenv("REDIS_HOST", "localhost") + ":" + getenv("REDIS_PORT", "6379"),
	})

	ii := NewInvertedIndex()
	ii.LoadSnapshot(ctx, rdb) // rebuild on boot

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// POST /api/search/index -> 201 { id, indexed: true }
	r.POST("/api/search/index", func(c *gin.Context) {
		var req indexRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.ID == "" || req.Content == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "id and content are required non-empty strings"})
			return
		}
		ii.IndexDocument(req.ID, req.Content)
		ii.SaveSnapshot(ctx, rdb)
		c.JSON(http.StatusCreated, gin.H{"id": req.ID, "indexed": true})
	})

	// GET /api/search?q=...&limit=n -> 200 { query, hits }
	r.GET("/api/search", func(c *gin.Context) {
		q := c.Query("q")
		limit := 5
		if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 {
			limit = l
		}
		c.JSON(http.StatusOK, gin.H{"query": q, "hits": ii.Search(q, limit)})
	})

	// GET /api/search/stats -> 200 { numDocs, vocabSize, avgdl }
	r.GET("/api/search/stats", func(c *gin.Context) {
		c.JSON(http.StatusOK, ii.Stats())
	})

	// DELETE /api/search/index/:id -> 200 { id, deleted }
	r.DELETE("/api/search/index/:id", func(c *gin.Context) {
		id := c.Param("id")
		deleted := ii.RemoveDocument(id)
		ii.SaveSnapshot(ctx, rdb)
		c.JSON(http.StatusOK, gin.H{"id": id, "deleted": deleted})
	})

	// POST /api/search/reset -> 201 { reset: true }
	r.POST("/api/search/reset", func(c *gin.Context) {
		ii.Reset()
		ii.SaveSnapshot(ctx, rdb)
		c.JSON(http.StatusCreated, gin.H{"reset": true})
	})

	_ = r.Run(":" + getenv("PORT", "3000"))
}
