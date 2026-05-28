export type MatchedPassage = { text: string; startWord: number };

export type SourceMatch = {
  submission_id: string;
  student_id: string;
  similarity_pct: number;
  matched_passages: MatchedPassage[];
  source_url?: string;
  source_title?: string;
};

export type Document = {
  submission_id: string;
  student_id: string;
  text: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [term, val] of a) {
    dot += val * (b.get(term) ?? 0);
    magA += val * val;
  }
  for (const val of b.values()) magB += val * val;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function buildTfIdfVectors(allTokenized: string[][]): Map<string, number>[] {
  const N = allTokenized.length;
  // document frequency
  const df = new Map<string, number>();
  for (const tokens of allTokenized) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  // IDF with smoothing
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  // TF-IDF per document
  return allTokenized.map(tokens => {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [term, freq] of tf) {
      vec.set(term, (freq / (tokens.length || 1)) * (idf.get(term) ?? 1));
    }
    return vec;
  });
}

function findMatchingPhrases(textA: string, textB: string, minWords = 5): MatchedPassage[] {
  const wordsA = textA.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const wordsB = textB.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  const gramSetB = new Set<string>();
  for (let i = 0; i <= wordsB.length - minWords; i++) {
    gramSetB.add(wordsB.slice(i, i + minWords).join(' '));
  }

  const matches: MatchedPassage[] = [];
  const seen = new Set<string>();
  for (let i = 0; i <= wordsA.length - minWords; i++) {
    const gram = wordsA.slice(i, i + minWords).join(' ');
    if (gramSetB.has(gram) && !seen.has(gram)) {
      seen.add(gram);
      matches.push({ text: gram, startWord: i });
      if (matches.length >= 5) break;
    }
  }
  return matches;
}

export function runNativeCheck(
  target: Document,
  corpus: Document[],
): { similarity_pct: number; source_matches: SourceMatch[] } {
  if (!target.text.trim() || corpus.length === 0) {
    return { similarity_pct: 0, source_matches: [] };
  }

  const all = [target, ...corpus];
  const tokenized = all.map(d => tokenize(d.text));
  const vectors = buildTfIdfVectors(tokenized);

  const targetVec = vectors[0];
  const matches: SourceMatch[] = [];

  for (let i = 0; i < corpus.length; i++) {
    const sim = cosineSimilarity(targetVec, vectors[i + 1]);
    if (sim >= 0.05) {
      matches.push({
        submission_id: corpus[i].submission_id,
        student_id: corpus[i].student_id,
        similarity_pct: Math.round(sim * 100),
        matched_passages: findMatchingPhrases(target.text, corpus[i].text),
      });
    }
  }

  matches.sort((a, b) => b.similarity_pct - a.similarity_pct);
  const topSim = matches.length > 0 ? matches[0].similarity_pct : 0;

  return { similarity_pct: topSim, source_matches: matches };
}
