// Hybrid search orchestrator (Go / net/http).
//
// Fans out in parallel (goroutines + sync.WaitGroup) to a BM25 upstream and a
// vector upstream, then fuses the two ranked lists in-process with Reciprocal
// Rank Fusion (k=60). The HTTP contract is identical to the TypeScript/Java/C#
// implementations: GET /api/search, /api/search/bm25, /api/search/vector.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"
)

// Doc is a document as returned by an upstream engine.
type Doc struct {
	ID      string  `json:"id"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
}

// Sources records the 1-based rank of a document in each upstream list.
type Sources struct {
	BM25Rank   *int `json:"bm25Rank"`
	VectorRank *int `json:"vectorRank"`
}

// Hit is a fused result after RRF.
type Hit struct {
	ID       string  `json:"id"`
	Content  string  `json:"content"`
	RRFScore float64 `json:"rrfScore"`
	Sources  Sources `json:"sources"`
}

type upstreamResponse struct {
	Mode string `json:"mode"`
	Hits []Doc  `json:"hits"`
}

const rrfK = 60

// SearchService holds upstream URLs and the configurable RRF constant.
type SearchService struct {
	bm25URL   string
	vectorURL string
	k         int
	client    *http.Client
}

func newSearchService() *SearchService {
	k := rrfK
	if v := os.Getenv("RRF_K"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			k = parsed
		}
	}
	return &SearchService{
		bm25URL:   getenv("BM25_URL", "http://bm25-service:4001/search"),
		vectorURL: getenv("VECTOR_URL", "http://vector-service:4002/search"),
		k:         k,
		client:    &http.Client{Timeout: 2 * time.Second},
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// fanOut queries both upstreams concurrently and isolates per-branch failure.
func (s *SearchService) fanOut(ctx context.Context, q string, limit int) ([]Doc, []Doc) {
	var wg sync.WaitGroup
	var bm25, vector []Doc

	wg.Add(2)
	go func() {
		defer wg.Done()
		res, err := s.callUpstream(ctx, s.bm25URL, q, limit)
		if err != nil {
			log.Printf("bm25 upstream failed: %v (degrading)", err)
			return
		}
		bm25 = res
	}()
	go func() {
		defer wg.Done()
		res, err := s.callUpstream(ctx, s.vectorURL, q, limit)
		if err != nil {
			log.Printf("vector upstream failed: %v (degrading)", err)
			return
		}
		vector = res
	}()

	wg.Wait() // Total latency = max(branch latencies), not the sum.
	return bm25, vector
}

func (s *SearchService) callUpstream(ctx context.Context, base, q string, limit int) ([]Doc, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base, nil)
	if err != nil {
		return nil, err
	}
	qp := req.URL.Query()
	qp.Set("q", q)
	qp.Set("limit", strconv.Itoa(limit))
	req.URL.RawQuery = qp.Encode()

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var body upstreamResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	return body.Hits, nil
}

// fuseRRF merges ranked lists by rank position, not by raw score.
func (s *SearchService) fuseRRF(bm25, vector []Doc) []Hit {
	acc := map[string]*Hit{}

	accumulate := func(list []Doc, isBM25 bool) {
		for i, doc := range list {
			rank := i + 1 // 1-based
			h, ok := acc[doc.ID]
			if !ok {
				h = &Hit{ID: doc.ID, Content: doc.Content}
				acc[doc.ID] = h
			}
			// Core RRF term: 1/(k+rank). A doc in BOTH lists sums two terms -> consensus boost.
			h.RRFScore += 1.0 / float64(s.k+rank)
			r := rank
			if isBM25 {
				h.Sources.BM25Rank = &r
			} else {
				h.Sources.VectorRank = &r
			}
		}
	}

	accumulate(bm25, true)
	accumulate(vector, false)

	out := make([]Hit, 0, len(acc))
	for _, h := range acc {
		out = append(out, *h)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RRFScore > out[j].RRFScore })
	return out
}

func parseLimit(raw string, def int) int {
	if raw == "" {
		return def
	}
	if v, err := strconv.Atoi(raw); err == nil && v > 0 {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *SearchService) handleHybrid(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	limit := parseLimit(r.URL.Query().Get("limit"), 10)

	bm25, vector := s.fanOut(r.Context(), q, limit*2)
	hits := s.fuseRRF(bm25, vector)
	if len(hits) > limit {
		hits = hits[:limit]
	}
	writeJSON(w, map[string]any{"mode": "hybrid_rrf", "hits": hits})
}

func (s *SearchService) handlePassthrough(mode, base string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		limit := parseLimit(r.URL.Query().Get("limit"), 10)
		docs, err := s.callUpstream(r.Context(), base, q, limit)
		if err != nil {
			writeJSON(w, map[string]any{"mode": mode, "hits": []Doc{}}) // degrade
			return
		}
		writeJSON(w, map[string]any{"mode": mode, "hits": docs})
	}
}

func main() {
	s := newSearchService()
	mux := http.NewServeMux()
	mux.HandleFunc("/api/search/bm25", s.handlePassthrough("bm25", s.bm25URL))
	mux.HandleFunc("/api/search/vector", s.handlePassthrough("vector", s.vectorURL))
	mux.HandleFunc("/api/search", s.handleHybrid)

	port := getenv("PORT", "3000")
	log.Printf("hybrid-search-service listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
