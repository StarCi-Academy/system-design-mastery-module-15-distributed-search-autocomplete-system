package main

import (
	"math"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// k1 controls how fast tf saturates; b controls document-length normalization.
const (
	k1 = 1.2
	b  = 0.75
)

var tokenSplit = regexp.MustCompile(`[^a-z0-9]+`)

// docRecord holds a document's content and its token count.
type docRecord struct {
	Content string `json:"content"`
	Length  int    `json:"length"`
}

// SearchHit is one ranked result returned to the client.
type SearchHit struct {
	ID      string  `json:"id"`
	Score   float64 `json:"score"`
	Content string  `json:"content"`
}

// InvertedIndex is an in-memory inverted index with BM25 scoring.
type InvertedIndex struct {
	mu          sync.RWMutex
	index       map[string]map[string]int // term -> (docID -> tf)
	docs        map[string]docRecord      // docID -> record
	totalLength int
}

// NewInvertedIndex creates an empty index.
func NewInvertedIndex() *InvertedIndex {
	return &InvertedIndex{
		index: make(map[string]map[string]int),
		docs:  make(map[string]docRecord),
	}
}

// tokenize lowercases and splits on non-alphanumeric so "Redis-Cluster!" -> ["redis","cluster"].
// The SAME tokenizer runs at index and query time, otherwise terms never line up.
func tokenize(text string) []string {
	parts := tokenSplit.Split(strings.ToLower(text), -1)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// IndexDocument adds or replaces a document and updates the posting lists.
func (ii *InvertedIndex) IndexDocument(id, content string) {
	ii.mu.Lock()
	defer ii.mu.Unlock()
	ii.removeLocked(id) // re-indexing the same id must not double-count terms
	terms := tokenize(content)
	ii.docs[id] = docRecord{Content: content, Length: len(terms)}
	ii.totalLength += len(terms)

	tf := make(map[string]int)
	for _, t := range terms {
		tf[t]++
	}
	for term, freq := range tf {
		if ii.index[term] == nil {
			ii.index[term] = make(map[string]int)
		}
		ii.index[term][id] = freq
	}
}

// removeLocked removes a document and prunes orphaned terms. Caller holds the lock.
func (ii *InvertedIndex) removeLocked(id string) bool {
	doc, ok := ii.docs[id]
	if !ok {
		return false
	}
	ii.totalLength -= doc.Length
	delete(ii.docs, id)
	for term, postings := range ii.index {
		if _, present := postings[id]; present {
			delete(postings, id)
			if len(postings) == 0 {
				delete(ii.index, term)
			}
		}
	}
	return true
}

// RemoveDocument removes a document by id.
func (ii *InvertedIndex) RemoveDocument(id string) bool {
	ii.mu.Lock()
	defer ii.mu.Unlock()
	return ii.removeLocked(id)
}

// idf weights rare terms more than common ones. Caller holds at least a read lock.
func (ii *InvertedIndex) idf(term string) float64 {
	n := len(ii.index[term])
	N := len(ii.docs)
	if n == 0 {
		return 0
	}
	return math.Log(1 + (float64(N)-float64(n)+0.5)/(float64(n)+0.5))
}

// bm25Term scores one document for one term. Caller holds at least a read lock.
func (ii *InvertedIndex) bm25Term(term, docID string) float64 {
	tf := ii.index[term][docID]
	if tf == 0 {
		return 0
	}
	dl := float64(ii.docs[docID].Length)
	avgdl := float64(ii.totalLength) / float64(len(ii.docs))
	numerator := float64(tf) * (k1 + 1)
	denominator := float64(tf) + k1*(1-b+b*(dl/avgdl))
	return ii.idf(term) * (numerator / denominator)
}

// Search ranks documents for a query, summing BM25 over each query term.
func (ii *InvertedIndex) Search(query string, limit int) []SearchHit {
	ii.mu.RLock()
	defer ii.mu.RUnlock()
	terms := tokenize(query)
	if len(terms) == 0 || len(ii.docs) == 0 {
		return []SearchHit{}
	}
	scores := make(map[string]float64)
	for _, term := range terms {
		for docID := range ii.index[term] {
			scores[docID] += ii.bm25Term(term, docID)
		}
	}
	hits := make([]SearchHit, 0, len(scores))
	for id, score := range scores {
		if score > 0 {
			hits = append(hits, SearchHit{ID: id, Score: score, Content: ii.docs[id].Content})
		}
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

// Stats reports the corpus statistics BM25 depends on.
func (ii *InvertedIndex) Stats() map[string]interface{} {
	ii.mu.RLock()
	defer ii.mu.RUnlock()
	numDocs := len(ii.docs)
	avgdl := 0.0
	if numDocs > 0 {
		avgdl = float64(ii.totalLength) / float64(numDocs)
	}
	return map[string]interface{}{
		"numDocs":   numDocs,
		"vocabSize": len(ii.index),
		"avgdl":     avgdl,
	}
}

// Reset clears the whole index.
func (ii *InvertedIndex) Reset() {
	ii.mu.Lock()
	defer ii.mu.Unlock()
	ii.index = make(map[string]map[string]int)
	ii.docs = make(map[string]docRecord)
	ii.totalLength = 0
}
