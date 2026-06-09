'use strict';

// Minimal dependency-free mock search upstream. One image, two roles selected by
// the MODE env var ("bm25" lexical, or "vector" semantic). It serves a fixed seeded
// corpus and returns a ranked list { mode, hits: [{ id, content, score }] } so the
// hybrid orchestrator can fuse the two rankings by rank position with RRF.

const http = require('http');

const MODE = process.env.MODE === 'vector' ? 'vector' : 'bm25';
const PORT = parseInt(process.env.PORT || (MODE === 'vector' ? '4002' : '4001'), 10);

// Shared seeded corpus. Each document has a lexical keyword set (for BM25-style
// matching) and a semantic tag set (for vector-style matching). doc-3 is engineered
// to be a consensus document: it ranks well on BOTH signals for "distributed search".
const CORPUS = [
  { id: 'doc-1', content: 'introduction to information retrieval', keywords: ['information', 'retrieval', 'search'], semantics: ['retrieval', 'indexing'] },
  { id: 'doc-3', content: 'distributed search engines and ranking', keywords: ['distributed', 'search', 'ranking', 'engines'], semantics: ['distributed', 'search', 'ranking'] },
  { id: 'doc-5', content: 'semantic vector embeddings overview', keywords: ['semantic', 'vector', 'embeddings'], semantics: ['search', 'semantic', 'distributed'] },
  { id: 'doc-7', content: 'scaling consensus in partitioned networks', keywords: ['consensus', 'partitioned', 'networks'], semantics: ['distributed', 'consensus'] },
  { id: 'doc-9', content: 'inverted index data structures', keywords: ['inverted', 'index', 'structures'], semantics: ['indexing', 'retrieval'] },
];

function tokenize(q) {
  return q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

// Lexical score: count of query tokens that appear in a doc's keyword set, with a
// small unbounded weight so the scale looks like BM25 (e.g. 12.74), not [0,1].
function bm25Score(tokens, doc) {
  let hits = 0;
  for (const t of tokens) if (doc.keywords.includes(t)) hits += 1;
  return hits === 0 ? 0 : Number((hits * 4.2 + doc.keywords.length * 0.1).toFixed(2));
}

// Semantic score: fraction of query tokens whose concept appears in the doc's
// semantic tags, mapped into a cosine-like [0,1] range.
function vectorScore(tokens, doc) {
  let hits = 0;
  for (const t of tokens) if (doc.semantics.includes(t)) hits += 1;
  if (hits === 0) return 0;
  return Number(Math.min(0.99, 0.6 + hits * 0.13).toFixed(2));
}

function rank(q, limit) {
  const tokens = tokenize(q);
  const scorer = MODE === 'vector' ? vectorScore : bm25Score;
  return CORPUS
    .map((doc) => ({ id: doc.id, content: doc.content, score: scorer(tokens, doc) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/search') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const q = url.searchParams.get('q') || '';
  const limit = parseInt(url.searchParams.get('limit') || '10', 10);
  const hits = rank(q, limit);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ mode: MODE, hits }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`${MODE}-service (mock) listening on :${PORT}`);
});
