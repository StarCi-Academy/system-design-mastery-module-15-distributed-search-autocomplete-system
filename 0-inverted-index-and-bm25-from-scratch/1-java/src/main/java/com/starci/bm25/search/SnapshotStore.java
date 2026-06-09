package com.starci.bm25.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import redis.clients.jedis.JedisPool;
import redis.clients.jedis.Jedis;

/** Persists/restores the whole index as one JSON value under a single Redis key. */
@Component
public class SnapshotStore {

    private static final String SNAPSHOT_KEY = "bm25:index:snapshot";

    private final JedisPool pool;
    private final ObjectMapper mapper = new ObjectMapper();

    public SnapshotStore(@Value("${redis.host}") String host,
                         @Value("${redis.port}") int port) {
        this.pool = new JedisPool(host, port);
    }

    /** Save on every write so the snapshot is always current. */
    public void save(InvertedIndex.Snapshot snap) {
        try (Jedis jedis = pool.getResource()) {
            jedis.set(SNAPSHOT_KEY, mapper.writeValueAsString(snap));
        } catch (Exception ignored) {
            // Redis outage -> fall back to a pure in-memory index.
        }
    }

    /** Load on boot; returns null when the key is absent or Redis is unreachable. */
    public InvertedIndex.Snapshot load() {
        try (Jedis jedis = pool.getResource()) {
            String raw = jedis.get(SNAPSHOT_KEY);
            if (raw == null) {
                return null;
            }
            return mapper.readValue(raw, InvertedIndex.Snapshot.class);
        } catch (Exception ignored) {
            return null;
        }
    }
}
