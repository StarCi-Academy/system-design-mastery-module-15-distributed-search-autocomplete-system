package main

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

// snapshotKey holds the single JSON snapshot of the whole index.
const snapshotKey = "bm25:index:snapshot"

// snapshot is the serializable form of the index.
type snapshot struct {
	Index       map[string]map[string]int `json:"index"`
	Docs        map[string]docRecord      `json:"docs"`
	TotalLength int                       `json:"totalLength"`
}

// SaveSnapshot serializes the whole index to one Redis key.
func (ii *InvertedIndex) SaveSnapshot(ctx context.Context, rdb *redis.Client) {
	ii.mu.RLock()
	snap := snapshot{Index: ii.index, Docs: ii.docs, TotalLength: ii.totalLength}
	ii.mu.RUnlock()
	raw, err := json.Marshal(snap)
	if err != nil {
		return
	}
	// Best-effort: a Redis outage falls back to a pure in-memory index.
	_ = rdb.Set(ctx, snapshotKey, raw, 0).Err()
}

// LoadSnapshot rebuilds the index from the Redis snapshot on boot.
func (ii *InvertedIndex) LoadSnapshot(ctx context.Context, rdb *redis.Client) {
	raw, err := rdb.Get(ctx, snapshotKey).Bytes()
	if err != nil {
		return // missing key or unreachable -> start empty
	}
	var snap snapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		return
	}
	ii.mu.Lock()
	defer ii.mu.Unlock()
	ii.index = snap.Index
	ii.docs = snap.Docs
	ii.totalLength = snap.TotalLength
	if ii.index == nil {
		ii.index = make(map[string]map[string]int)
	}
	if ii.docs == nil {
		ii.docs = make(map[string]docRecord)
	}
}
