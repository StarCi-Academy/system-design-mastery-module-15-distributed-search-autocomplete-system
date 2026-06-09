using System.Text.RegularExpressions;

namespace Bm25SearchService;

/// <summary>A stored document.</summary>
public record DocRecord(string Content, int Length);

/// <summary>One ranked search hit.</summary>
public record SearchHit(string Id, double Score, string Content);

/// <summary>Serializable form of the index for the Redis snapshot.</summary>
public class Snapshot
{
    public Dictionary<string, Dictionary<string, int>> Index { get; set; } = new();
    public Dictionary<string, DocRecord> Docs { get; set; } = new();
    public long TotalLength { get; set; }
}

/// <summary>In-memory inverted index with BM25 scoring.</summary>
public class InvertedIndex
{
    // k1 controls tf saturation; b controls document-length normalization.
    private const double K1 = 1.2;
    private const double B = 0.75;

    private static readonly Regex Splitter = new("[^a-z0-9]+", RegexOptions.Compiled);

    private readonly Dictionary<string, Dictionary<string, int>> _index = new();
    private readonly Dictionary<string, DocRecord> _docs = new();
    private long _totalLength;
    private readonly object _lock = new();

    /// <summary>Lowercase + split on non-alphanumeric. Same tokenizer at index and query time.</summary>
    public static List<string> Tokenize(string text)
    {
        var result = new List<string>();
        foreach (var t in Splitter.Split(text.ToLowerInvariant()))
        {
            if (t.Length > 0) result.Add(t);
        }
        return result;
    }

    public void IndexDocument(string id, string content)
    {
        lock (_lock)
        {
            RemoveLocked(id); // re-indexing must not double-count terms
            var terms = Tokenize(content);
            _docs[id] = new DocRecord(content, terms.Count);
            _totalLength += terms.Count;

            var tf = new Dictionary<string, int>();
            foreach (var term in terms)
                tf[term] = tf.GetValueOrDefault(term, 0) + 1;

            foreach (var (term, freq) in tf)
            {
                if (!_index.TryGetValue(term, out var postings))
                {
                    postings = new Dictionary<string, int>();
                    _index[term] = postings;
                }
                postings[id] = freq;
            }
        }
    }

    private bool RemoveLocked(string id)
    {
        if (!_docs.TryGetValue(id, out var doc)) return false;
        _totalLength -= doc.Length;
        _docs.Remove(id);
        foreach (var term in _index.Keys.ToList())
        {
            var postings = _index[term];
            if (postings.Remove(id) && postings.Count == 0)
                _index.Remove(term); // prune orphaned term
        }
        return true;
    }

    public bool RemoveDocument(string id)
    {
        lock (_lock) { return RemoveLocked(id); }
    }

    private double Idf(string term)
    {
        var n = _index.TryGetValue(term, out var p) ? p.Count : 0;
        var bigN = _docs.Count;
        if (n == 0) return 0;
        return Math.Log(1 + (bigN - n + 0.5) / (n + 0.5));
    }

    private double Bm25Term(string term, string docId)
    {
        if (!_index.TryGetValue(term, out var postings) || !postings.TryGetValue(docId, out var tf) || tf == 0)
            return 0;
        double dl = _docs[docId].Length;
        double avgdl = (double)_totalLength / _docs.Count;
        double numerator = tf * (K1 + 1);
        double denominator = tf + K1 * (1 - B + B * (dl / avgdl));
        return Idf(term) * (numerator / denominator);
    }

    public List<SearchHit> Search(string query, int limit)
    {
        lock (_lock)
        {
            var terms = Tokenize(query);
            if (terms.Count == 0 || _docs.Count == 0) return new List<SearchHit>();

            var scores = new Dictionary<string, double>();
            foreach (var term in terms)
            {
                if (!_index.TryGetValue(term, out var postings)) continue;
                foreach (var docId in postings.Keys)
                    scores[docId] = scores.GetValueOrDefault(docId, 0) + Bm25Term(term, docId);
            }

            return scores
                .Where(kv => kv.Value > 0)
                .OrderByDescending(kv => kv.Value)
                .Take(limit)
                .Select(kv => new SearchHit(kv.Key, kv.Value, _docs[kv.Key].Content))
                .ToList();
        }
    }

    public Dictionary<string, object> Stats()
    {
        lock (_lock)
        {
            var numDocs = _docs.Count;
            double avgdl = numDocs == 0 ? 0 : (double)_totalLength / numDocs;
            return new Dictionary<string, object>
            {
                ["numDocs"] = numDocs,
                ["vocabSize"] = _index.Count,
                ["avgdl"] = avgdl
            };
        }
    }

    public void Reset()
    {
        lock (_lock)
        {
            _index.Clear();
            _docs.Clear();
            _totalLength = 0;
        }
    }

    public Snapshot ToSnapshot()
    {
        lock (_lock)
        {
            return new Snapshot
            {
                Index = _index.ToDictionary(e => e.Key, e => new Dictionary<string, int>(e.Value)),
                Docs = new Dictionary<string, DocRecord>(_docs),
                TotalLength = _totalLength
            };
        }
    }

    public void FromSnapshot(Snapshot snap)
    {
        lock (_lock)
        {
            _index.Clear();
            _docs.Clear();
            foreach (var (term, postings) in snap.Index)
                _index[term] = new Dictionary<string, int>(postings);
            foreach (var (id, doc) in snap.Docs)
                _docs[id] = doc;
            _totalLength = snap.TotalLength;
        }
    }
}
