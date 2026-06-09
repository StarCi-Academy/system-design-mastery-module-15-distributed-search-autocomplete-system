package com.starci.hybrid;

import com.starci.hybrid.Models.PassthroughResponse;
import com.starci.hybrid.Models.SearchResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/search")
public class SearchController {

    private final HybridSearchService service;

    public SearchController(HybridSearchService service) {
        this.service = service;
    }

    @GetMapping
    public Mono<SearchResponse> hybrid(@RequestParam(defaultValue = "") String q,
                                       @RequestParam(defaultValue = "10") int limit) {
        return service.search(q, limit).map(hits -> new SearchResponse("hybrid_rrf", hits));
    }

    @GetMapping("/bm25")
    public Mono<PassthroughResponse> bm25(@RequestParam(defaultValue = "") String q,
                                          @RequestParam(defaultValue = "10") int limit) {
        return service.passthrough(true, q, limit).map(hits -> new PassthroughResponse("bm25", hits));
    }

    @GetMapping("/vector")
    public Mono<PassthroughResponse> vector(@RequestParam(defaultValue = "") String q,
                                            @RequestParam(defaultValue = "10") int limit) {
        return service.passthrough(false, q, limit).map(hits -> new PassthroughResponse("vector", hits));
    }
}
