package com.starci.bm25.search;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * In-memory inverted index with BM25 scoring.
 * Holds term -> (docId -> tf) posting lists plus per-document lengths.
 */
public class InvertedIndex {

    /** k1 controls tf saturation; b controls document-length normalization. */
    private static final double K1 = 1.2;
    private static final double B = 0.75;

    /** A stored document. */
    public record DocRecord(String content, int length) {}

    /** One ranked hit. */
    public record SearchHit(String id, double score, String content) {}

    private final Map<String, Map<String, Integer>> index = new HashMap<>();
    private final Map<String, DocRecord> docs = new HashMap<>();
    private long totalLength = 0;

    /** Lowercase + split on non-alphanumeric. Same tokenizer at index and query time. */
    public static List<String> tokenize(String text) {
        List<String> out = new ArrayList<>();
        for (String t : text.toLowerCase().split("[^a-z0-9]+")) {
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out;
    }

    /** Add or replace a document and update posting lists. */
    public synchronized void indexDocument(String id, String content) {
        removeDocument(id); // re-indexing must not double-count terms
        List<String> terms = tokenize(content);
        docs.put(id, new DocRecord(content, terms.size()));
        totalLength += terms.size();

        Map<String, Integer> tf = new HashMap<>();
        for (String term : terms) {
            tf.merge(term, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> e : tf.entrySet()) {
            index.computeIfAbsent(e.getKey(), k -> new HashMap<>()).put(id, e.getValue());
        }
    }

    /** Remove a document and prune any term whose posting list becomes empty. */
    public synchronized boolean removeDocument(String id) {
        DocRecord doc = docs.remove(id);
        if (doc == null) {
            return false;
        }
        totalLength -= doc.length();
        index.entrySet().removeIf(entry -> {
            entry.getValue().remove(id);
            return entry.getValue().isEmpty();
        });
        return true;
    }

    private double idf(String term) {
        int n = index.getOrDefault(term, Map.of()).size();
        int bigN = docs.size();
        if (n == 0) {
            return 0;
        }
        return Math.log(1 + (bigN - n + 0.5) / (n + 0.5));
    }

    private double bm25Term(String term, String docId) {
        Integer tfBox = index.getOrDefault(term, Map.of()).get(docId);
        if (tfBox == null || tfBox == 0) {
            return 0;
        }
        int tf = tfBox;
        double dl = docs.get(docId).length();
        double avgdl = (double) totalLength / docs.size();
        double numerator = tf * (K1 + 1);
        double denominator = tf + K1 * (1 - B + B * (dl / avgdl));
        return idf(term) * (numerator / denominator);
    }

    /** Rank documents for a query by summing BM25 over each query term. */
    public synchronized List<SearchHit> search(String query, int limit) {
        List<String> terms = tokenize(query);
        if (terms.isEmpty() || docs.isEmpty()) {
            return List.of();
        }
        Map<String, Double> scores = new HashMap<>();
        for (String term : terms) {
            Map<String, Integer> postings = index.get(term);
            if (postings == null) {
                continue;
            }
            for (String docId : postings.keySet()) {
                scores.merge(docId, bm25Term(term, docId), Double::sum);
            }
        }
        List<SearchHit> hits = new ArrayList<>();
        for (Map.Entry<String, Double> e : scores.entrySet()) {
            if (e.getValue() > 0) {
                hits.add(new SearchHit(e.getKey(), e.getValue(), docs.get(e.getKey()).content()));
            }
        }
        hits.sort(Comparator.comparingDouble(SearchHit::score).reversed());
        return hits.size() > limit ? hits.subList(0, limit) : hits;
    }

    /** Corpus statistics that BM25 depends on. */
    public synchronized Map<String, Object> stats() {
        int numDocs = docs.size();
        double avgdl = numDocs == 0 ? 0 : (double) totalLength / numDocs;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("numDocs", numDocs);
        out.put("vocabSize", index.size());
        out.put("avgdl", avgdl);
        return out;
    }

    /** Clear the whole index. */
    public synchronized void reset() {
        index.clear();
        docs.clear();
        totalLength = 0;
    }

    // --- snapshot accessors ---

    synchronized Snapshot toSnapshot() {
        return new Snapshot(new HashMap<>(index), new HashMap<>(docs), totalLength);
    }

    synchronized void fromSnapshot(Snapshot snap) {
        index.clear();
        docs.clear();
        index.putAll(snap.index());
        docs.putAll(snap.docs());
        totalLength = snap.totalLength();
    }

    /** Serializable form of the index. */
    public record Snapshot(Map<String, Map<String, Integer>> index,
                           Map<String, DocRecord> docs,
                           long totalLength) {}
}
