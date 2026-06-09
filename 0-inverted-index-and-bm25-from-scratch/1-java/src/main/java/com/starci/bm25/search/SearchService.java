package com.starci.bm25.search;

import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/** Coordinates the in-memory index with the Redis snapshot store. */
@Service
public class SearchService {

    private final InvertedIndex index = new InvertedIndex();
    private final SnapshotStore store;

    public SearchService(SnapshotStore store) {
        this.store = store;
    }

    /** Rebuild the in-memory index from Redis once on boot. */
    @PostConstruct
    public void load() {
        InvertedIndex.Snapshot snap = store.load();
        if (snap != null) {
            index.fromSnapshot(snap);
        }
    }

    public void indexDocument(String id, String content) {
        index.indexDocument(id, content);
        store.save(index.toSnapshot());
    }

    public boolean removeDocument(String id) {
        boolean removed = index.removeDocument(id);
        store.save(index.toSnapshot());
        return removed;
    }

    public List<InvertedIndex.SearchHit> search(String query, int limit) {
        return index.search(query, limit);
    }

    public Map<String, Object> stats() {
        return index.stats();
    }

    public void reset() {
        index.reset();
        store.save(index.toSnapshot());
    }
}
