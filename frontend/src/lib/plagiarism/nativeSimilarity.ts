/**
 * Native plagiarism similarity engine.
 *
 * Algorithm:
 *  1. Strip HTML, normalize text
 *  2. Build 5-gram sets per document
 *  3. Jaccard similarity = |A ∩ B| / |A ∪ B|
 *  4. Extract matching passages (contiguous runs of matching 5-grams)
 */

const NGRAM_SIZE = 5;
const MIN_PASSAGE_GRAMS = 3; // consecutive matching n-grams to qualify as a passage

export interface MatchedPassage {
  text:       string;
  startWord:  number;
}

export interface SimilarityResult {
  similarity_pct: number;
  matched_passages: MatchedPassage[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
}

function normalize(text: string): string {
  return stripHtml(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

function buildNgramSet(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - NGRAM_SIZE; i++) {
    set.add(tokens.slice(i, i + NGRAM_SIZE).join(' '));
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const gram of a) { if (b.has(gram)) intersection++; }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractPassages(tokensA: string[], setB: Set<string>): MatchedPassage[] {
  const passages: MatchedPassage[] = [];
  let run: string[] = [];
  let runStart = 0;

  for (let i = 0; i <= tokensA.length - NGRAM_SIZE; i++) {
    const gram = tokensA.slice(i, i + NGRAM_SIZE).join(' ');
    if (setB.has(gram)) {
      if (run.length === 0) runStart = i;
      run.push(...tokensA.slice(i, i + NGRAM_SIZE));
    } else {
      if (run.length >= MIN_PASSAGE_GRAMS * NGRAM_SIZE) {
        passages.push({ text: [...new Set(run)].join(' ').slice(0, 300), startWord: runStart });
      }
      run = [];
    }
  }
  if (run.length >= MIN_PASSAGE_GRAMS * NGRAM_SIZE) {
    passages.push({ text: [...new Set(run)].join(' ').slice(0, 300), startWord: runStart });
  }
  return passages;
}

export function computeSimilarity(textA: string, textB: string): SimilarityResult {
  const tokA = tokenize(textA);
  const tokB = tokenize(textB);
  if (tokA.length < NGRAM_SIZE || tokB.length < NGRAM_SIZE) {
    return { similarity_pct: 0, matched_passages: [] };
  }
  const setA = buildNgramSet(tokA);
  const setB = buildNgramSet(tokB);
  const sim = jaccardSimilarity(setA, setB);
  const passages = extractPassages(tokA, setB);
  return {
    similarity_pct:   Math.round(sim * 100),
    matched_passages: passages.slice(0, 5),
  };
}
