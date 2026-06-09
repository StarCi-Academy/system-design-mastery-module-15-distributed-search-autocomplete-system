package com.starci.hybrid;

import com.starci.hybrid.Models.Doc;
import com.starci.hybrid.Models.Hit;
import com.starci.hybrid.Models.UpstreamResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;

@Service
public class HybridSearchService {

    private final WebClient bm25Client;
    private final WebClient vectorClient;
    private final int rrfK;

    public HybridSearchService(WebClient.Builder builder,
                               @Value("${upstream.bm25Url:http://bm25-service:4001/search}") String bm25Url,
                               @Value("${upstream.vectorUrl:http://vector-service:4002/search}") String vectorUrl,
                               @Value("${rrf.k:60}") int rrfK) {
        // One non-blocking WebClient per upstream; the connection pool is shared.
        this.bm25Client = builder.baseUrl(bm25Url).build();
        this.vectorClient = builder.baseUrl(vectorUrl).build();
        this.rrfK = rrfK;
    }

    /**
     * Fan out to both upstreams in parallel via Mono.zip. Each branch degrades to an
     * empty list on error (failure isolation), so one downed upstream does not fail
     * the whole request. Total latency is bounded by the slower upstream.
     */
    public Mono<List<Hit>> search(String q, int limit) {
        int fetchSize = Math.max(limit * 2, limit);
        Mono<List<Doc>> bm25 = fetch(bm25Client, q, fetchSize).onErrorReturn(List.of());
        Mono<List<Doc>> vector = fetch(vectorClient, q, fetchSize).onErrorReturn(List.of());
        return Mono.zip(bm25, vector)
                .map(t -> Rrf.fuse(t.getT1(), t.getT2(), rrfK, limit));
    }

    /** Pass-through to a single upstream; returns its untouched ranked list. */
    public Mono<List<Doc>> passthrough(boolean isBm25, String q, int limit) {
        return fetch(isBm25 ? bm25Client : vectorClient, q, limit).onErrorReturn(List.of());
    }

    private Mono<List<Doc>> fetch(WebClient client, String q, int limit) {
        return client.get()
                .uri(uri -> uri.queryParam("q", q).queryParam("limit", limit).build())
                .retrieve()
                .bodyToMono(UpstreamResponse.class)
                .map(UpstreamResponse::hits);
    }
}
