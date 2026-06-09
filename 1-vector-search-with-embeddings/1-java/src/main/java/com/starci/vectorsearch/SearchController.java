package com.starci.vectorsearch;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * REST surface for the vector-search demo. Every endpoint returns the same JSON
 * shape and HTTP status as the other three language implementations.
 */
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final DocumentRepository repo;
    private final EmbeddingModel embedder;

    public SearchController(DocumentRepository repo, EmbeddingModel embedder) {
        this.repo = repo;
        this.embedder = embedder;
    }

    // GET /api/search?q=&limit= -> 200 { query, hits: [{ id, content, similarity }] }
    @GetMapping
    public Map<String, Object> search(@RequestParam(defaultValue = "") String q,
                                      @RequestParam(defaultValue = "5") int limit) {
        List<DocumentRepository.Hit> hits = repo.search(embedder.encode(q), limit);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", q);
        body.put("hits", hits);
        return body;
    }

    // GET /api/search/stats -> 200 { documents, dimensions }
    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("documents", repo.count());
        body.put("dimensions", EmbeddingModel.DIMENSIONS);
        return body;
    }

    // POST /api/search/index -> 201 { id, indexed: true }
    @PostMapping("/index")
    public ResponseEntity<Map<String, Object>> index(@RequestBody IndexRequest req) {
        repo.upsert(req.id(), req.content(), embedder.encode(req.content()));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", req.id());
        body.put("indexed", true);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    // DELETE /api/search/index/{id} -> 200 { id, deleted: true }
    @DeleteMapping("/index/{id}")
    public Map<String, Object> delete(@PathVariable String id) {
        repo.delete(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("deleted", true);
        return body;
    }

    // POST /api/search/reset -> 200 { reset: true }
    @PostMapping("/reset")
    public Map<String, Object> reset() {
        repo.reset();
        return Map.of("reset", true);
    }

    public record IndexRequest(String id, String content) {
    }
}
