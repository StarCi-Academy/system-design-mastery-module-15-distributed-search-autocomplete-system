package com.starci.hybrid;

import com.starci.hybrid.Models.Doc;
import com.starci.hybrid.Models.Hit;
import com.starci.hybrid.Models.Sources;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Reciprocal Rank Fusion (Cormack et al., 2009). */
public final class Rrf {
    private Rrf() {}

    private static final class Acc {
        final String id;
        final String content;
        double rrfScore;
        Integer bm25Rank;
        Integer vectorRank;

        Acc(String id, String content) {
            this.id = id;
            this.content = content;
        }
    }

    /**
     * Fuse two ranked lists by rank position. A document at 1-based rank r contributes
     * 1/(k+r); contributions are summed across lists, so a document present in BOTH lists
     * gains a consensus boost. Only rank is read — no score normalization is needed.
     */
    public static List<Hit> fuse(List<Doc> bm25, List<Doc> vector, int k, int limit) {
        Map<String, Acc> acc = new LinkedHashMap<>();

        accumulate(acc, bm25, k, true);
        accumulate(acc, vector, k, false);

        List<Acc> values = new ArrayList<>(acc.values());
        values.sort(Comparator.comparingDouble((Acc a) -> a.rrfScore).reversed());

        List<Hit> out = new ArrayList<>();
        for (int i = 0; i < values.size() && i < limit; i++) {
            Acc a = values.get(i);
            out.add(new Hit(a.id, a.content, a.rrfScore, new Sources(a.bm25Rank, a.vectorRank)));
        }
        return out;
    }

    private static void accumulate(Map<String, Acc> acc, List<Doc> docs, int k, boolean isBm25) {
        for (int i = 0; i < docs.size(); i++) {
            Doc d = docs.get(i);
            int rank = i + 1; // 1-based
            Acc a = acc.computeIfAbsent(d.id(), id -> new Acc(d.id(), d.content()));
            a.rrfScore += 1.0 / (k + rank);
            if (isBm25) a.bm25Rank = rank;
            else a.vectorRank = rank;
        }
    }
}
