/**
 * TF-IDF + cosine similarity ranking over a small in-memory document set.
 *
 * Built for product search: the catalogue is small enough (hundreds, not
 * millions, of rows) that computing term frequencies at request time is
 * cheap, and it gives genuinely better relevance ranking than a plain
 * `ILIKE` substring match -- a query like "fresh milk" ranks a product whose
 * name and description both mention "fresh" and "milk" above one that only
 * contains "milk" once in a long ingredients list.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'will', 'with', 'we', 'our', 'your', 'you',
]);

/** Lowercases, strips punctuation, and drops stopwords/short noise tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export interface TfidfDocument {
  id: string;
  /** Pre-tokenized field weights -- repeating a field's tokens boosts it,
   *  which is how the index gives more weight to the product name than to
   *  the full description without a separate weighting step. */
  tokens: string[];
}

export interface TfidfIndex {
  idf: Map<string, number>;
  vectors: Map<string, Map<string, number>>;
}

/**
 * Builds the index once per search request. `idf` (inverse document
 * frequency) needs the whole corpus to be meaningful -- a term that appears
 * in every product (e.g. "dairy") should contribute almost nothing to
 * ranking, which plain keyword matching cannot express.
 */
export function buildTfidfIndex(documents: TfidfDocument[]): TfidfIndex {
  const documentFrequency = new Map<string, number>();
  const termFrequencies = new Map<string, Map<string, number>>();

  for (const doc of documents) {
    const counts = new Map<string, number>();
    for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    termFrequencies.set(doc.id, counts);
    for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const totalDocs = documents.length || 1;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFrequency) {
    // +1 smoothing keeps a term that appears in every document from hitting
    // ln(1) = 0 and vanishing entirely -- it should rank low, not be inert.
    idf.set(term, Math.log(totalDocs / df) + 1);
  }

  const vectors = new Map<string, Map<string, number>>();
  for (const doc of documents) {
    const counts = termFrequencies.get(doc.id)!;
    const maxCount = Math.max(1, ...counts.values());
    const vector = new Map<string, number>();
    for (const [term, count] of counts) {
      // Sublinear TF (count / max count in doc) prevents one repeated word
      // from dominating a short product name.
      vector.set(term, (count / maxCount) * (idf.get(term) ?? 0));
    }
    vectors.set(doc.id, vector);
  }

  return { idf, vectors };
}

function cosineSimilaritySparse(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [term, weight] of a) {
    const other = b.get(term);
    if (other) dot += weight * other;
  }
  if (dot === 0) return 0;

  const normA = Math.sqrt([...a.values()].reduce((sum, w) => sum + w * w, 0));
  const normB = Math.sqrt([...b.values()].reduce((sum, w) => sum + w * w, 0));
  return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
}

/**
 * Scores every document in the index against a free-text query and returns
 * ids sorted by relevance, best first. A document with zero term overlap is
 * omitted entirely rather than returned with a score of 0, so callers can
 * treat an empty result as "no match" without an extra filter pass.
 */
export function searchTfidf(query: string, index: TfidfIndex): { id: string; score: number }[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const queryCounts = new Map<string, number>();
  for (const token of queryTokens) queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
  const maxCount = Math.max(...queryCounts.values());

  const queryVector = new Map<string, number>();
  for (const [term, count] of queryCounts) {
    queryVector.set(term, (count / maxCount) * (index.idf.get(term) ?? 0));
  }

  const results: { id: string; score: number }[] = [];
  for (const [id, vector] of index.vectors) {
    const score = cosineSimilaritySparse(queryVector, vector);
    if (score > 0) results.push({ id, score });
  }

  return results.sort((a, b) => b.score - a.score);
}
