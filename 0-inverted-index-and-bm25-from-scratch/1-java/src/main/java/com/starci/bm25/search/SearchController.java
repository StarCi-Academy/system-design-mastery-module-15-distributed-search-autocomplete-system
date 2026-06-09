package com.starci.bm25.search;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** REST surface for the BM25 inverted-index service. */
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final SearchService service;

    public SearchController(SearchService service) {
        this.service = service;
    }

    /** Request body for POST /api/search/index. */
    public record IndexRequest(String id, String content) {}

    // POST /api/search/index -> 201 { id, indexed: true }
    @PostMapping("/index")
    public ResponseEntity<Map<String, Object>> index(@RequestBody IndexRequest req) {
        if (req.id() == null || req.id().isBlank() || req.content() == null || req.content().isBlank()) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", "id and content are required non-empty strings");
            return ResponseEntity.badRequest().body(err);
        }
        service.indexDocument(req.id(), req.content());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", req.id());
        body.put("indexed", true);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    // GET /api/search?q=...&limit=n -> 200 { query, hits }
    @GetMapping
    public Map<String, Object> search(@RequestParam(name = "q", defaultValue = "") String q,
                                      @RequestParam(name = "limit", defaultValue = "5") int limit) {
        int effective = limit > 0 ? limit : 5;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", q);
        body.put("hits", service.search(q, effective));
        return body;
    }

    // GET /api/search/stats -> 200 { numDocs, vocabSize, avgdl }
    @GetMapping("/stats")
    public Map<String, Object> stats() {
        return service.stats();
    }

    // DELETE /api/search/index/{id} -> 200 { id, deleted }
    @DeleteMapping("/index/{id}")
    public Map<String, Object> remove(@PathVariable String id) {
        boolean deleted = service.removeDocument(id);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", id);
        body.put("deleted", deleted);
        return body;
    }

    // POST /api/search/reset -> 201 { reset: true }
    @PostMapping("/reset")
    public ResponseEntity<Map<String, Object>> reset() {
        service.reset();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("reset", true);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }
}
