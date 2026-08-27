/**
 * Product search ranking: BM25 over a small in-memory document set, with a
 * light stemmer, a domain synonym map, and a trigram fuzzy fallback for typos.
 *
 * Why BM25 rather than plain TF-IDF cosine:
 *   - TF saturation: the 2nd, 3rd, 10th occurrence of a word add ever less
 *     score (k1 term), so one keyword-stuffed description cannot dominate.
 *   - Length normalisation (b term): a long description is not unfairly
 *     rewarded just for containing more words. Cosine's L2 norm does this
 *     only crudely.
 *   - It is the ranking function Lucene / Elasticsearch / Postgres FTS use,
 *     so it is a defensible, well-understood default rather than a bespoke one.
 *
 * The catalogue is small (hundreds of rows), so the index is built per request
 * -- cheap, and always fresh. IDF still needs the whole corpus to be
 * meaningful (a term in every product should barely affect ranking), which a
 * substring match cannot express.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was',
  'will', 'with', 'we', 'our', 'your', 'you',
]);

/**
 * Domain synonyms, applied at tokenisation to BOTH documents and queries so a
 * shopper's word finds the shop's word. Keys and values are matched after
 * stemming. Kept small and hand-curated -- a generic thesaurus would add noise.
 */
const SYNONYMS: Record<string, string[]> = {
  curd: ['yogurt', 'yoghurt', 'dahi'],
  yogurt: ['curd', 'yoghurt', 'dahi'],
  yoghurt: ['curd', 'yogurt', 'dahi'],
  paneer: ['cottage', 'chena'],
  butter: ['makhan'],
  ghee: ['clarified'],
  milk: ['dairy'],
  buttermilk: ['chaas', 'chach'],
  lassi: ['smoothie'],
  cheese: ['cheddar', 'mozzarella'],
  sweet: ['dessert', 'mithai'],
};

/**
 * Very small English suffix stripper (a cut-down Porter). Folds plurals and
 * common verb forms so "eggs" matches "egg" and "baking" matches "bake". Not a
 * full stemmer -- it only needs to catch the endings that actually show up in
 * a grocery catalogue.
 */
export function stem(token: string): string {
  let t = token;
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('sses')) return t.slice(0, -2); // "glasses" -> "glass"
  if (t.length > 4 && (t.endsWith('ches') || t.endsWith('shes') || t.endsWith('xes'))) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) t = t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith('ed')) t = t.slice(0, -2);
  return t;
}

/** Lowercases, strips punctuation, drops stopwords/noise, stems, expands synonyms. */
export function tokenize(text: string): string[] {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map(stem);

  const expanded: string[] = [];
  for (const token of base) {
    expanded.push(token);
    const syns = SYNONYMS[token];
    if (syns) for (const s of syns) expanded.push(stem(s));
  }
  return expanded;
}

export interface TfidfDocument {
  id: string;
  /** Pre-tokenized field content. Callers may repeat a field's tokens to
   *  weight it (e.g. the product name three times), which BM25's TF-saturation
   *  turns into a bounded boost rather than a runaway one. */
  tokens: string[];
}

export interface TfidfIndex {
  idf: Map<string, number>;
  /** term frequencies per document */
  termFreqs: Map<string, Map<string, number>>;
  docLengths: Map<string, number>;
  avgDocLength: number;
  /** raw token lists, retained for the fuzzy fallback */
  docTokens: Map<string, string[]>;
}

const BM25_K1 = 1.5; // TF saturation: higher => extra occurrences keep mattering
const BM25_B = 0.75; // length normalisation strength: 0 = off, 1 = full

/** Builds the BM25 index once per search request. */
export function buildTfidfIndex(documents: TfidfDocument[]): TfidfIndex {
  const documentFrequency = new Map<string, number>();
  const termFreqs = new Map<string, Map<string, number>>();
  const docLengths = new Map<string, number>();
  const docTokens = new Map<string, string[]>();
  let totalLength = 0;

  for (const doc of documents) {
    const counts = new Map<string, number>();
    for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    termFreqs.set(doc.id, counts);
    docLengths.set(doc.id, doc.tokens.length);
    docTokens.set(doc.id, doc.tokens);
    totalLength += doc.tokens.length;
    for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const totalDocs = documents.length || 1;
  const idf = new Map<string, number>();
  for (const [term, df] of documentFrequency) {
    // BM25 IDF with +1 inside the log so a term present in every document
    // stays slightly positive (ranks low) instead of going negative.
    idf.set(term, Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5)));
  }

  return {
    idf,
    termFreqs,
    docLengths,
    avgDocLength: totalLength / totalDocs,
    docTokens,
  };
}

/**
 * Scores every document against a free-text query with BM25 and returns ids
 * sorted best-first. Documents with zero term overlap are omitted (so an empty
 * result genuinely means "no lexical match" and the caller can fall back to
 * `fuzzyMatch`).
 */
export function searchTfidf(query: string, index: TfidfIndex): { id: string; score: number }[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const results: { id: string; score: number }[] = [];

  for (const [id, termFreq] of index.termFreqs) {
    const docLength = index.docLengths.get(id) ?? 0;
    let score = 0;

    for (const term of queryTokens) {
      const tf = termFreq.get(term);
      if (!tf) continue;
      const idf = index.idf.get(term) ?? 0;
      const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * docLength) / (index.avgDocLength || 1));
      score += idf * ((tf * (BM25_K1 + 1)) / denom);
    }

    if (score > 0) results.push({ id, score });
  }

  return results.sort((a, b) => b.score - a.score);
}

/** Character trigrams of a string, e.g. "milk" -> {"  m"," mi","mil","ilk","lk "}. */
function trigrams(text: string): Set<string> {
  const padded = `  ${text.toLowerCase().replace(/[^a-z0-9]/g, '')} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Trigram (Dice) similarity in [0, 1]. 1 = identical after normalisation. */
export function trigramSimilarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared += 1;
  return (2 * shared) / (ga.size + gb.size);
}

/**
 * Typo-tolerant fallback: when BM25 finds nothing, compare the query against
 * each document's tokens by trigram similarity and keep anything over
 * `threshold`. Catches "chesse" -> "cheese", "yoghrt" -> "yoghurt".
 */
export function fuzzyMatch(
  query: string,
  index: TfidfIndex,
  threshold = 0.4,
): { id: string; score: number }[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return [];

  const results: { id: string; score: number }[] = [];
  for (const [id, tokens] of index.docTokens) {
    const uniqueTokens = [...new Set(tokens)];
    let best = 0;
    for (const qt of queryTerms) {
      for (const dt of uniqueTokens) {
        const sim = trigramSimilarity(qt, dt);
        if (sim > best) best = sim;
      }
    }
    if (best >= threshold) results.push({ id, score: best });
  }
  return results.sort((a, b) => b.score - a.score);
}
