// Shared text primitives for the autopsy engine. Pure, no DOM, no I/O.

const WORD_RE = /[\p{L}\p{N}']+/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;

export function words(text) {
  return text.toLowerCase().match(WORD_RE) || [];
}

export function charCount(text) {
  return [...text].length;
}

// Rough token estimate. Matches the common "chars / 4" heuristic closely enough
// for a joke metric, and is the same order of magnitude as real BPE counts.
export function tokens(text) {
  return Math.round(charCount(text) / 3.9);
}

export function countMatches(haystack, patterns) {
  let n = 0;
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m) n += m.length;
  }
  return n;
}

// Count of items carrying a pattern, not raw occurrences: "sorry sorry sorry"
// is one apology event, not three.
export function countEvents(haystack, patterns) {
  let n = 0;
  for (const re of patterns) {
    if (re.test(haystack)) n += 1;
  }
  return n;
}

export function ratePer100(count, total) {
  if (!total) return 0;
  return (count / total) * 100;
}

export function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function emojiCount(text) {
  return (text.match(EMOJI_RE) || []).length;
}

export function upperWordCount(text) {
  return (text.match(/\b[A-Z]{3,}\b/g) || []).length;
}

// Jaccard overlap of token sets. Used to spot re-asking the same question,
// which is the single most reliable "retry spiral" signal.
export function similarity(a, b) {
  return similarityOfSets(wordSet(a), wordSet(b));
}

// Pre-tokenised variant. Building a Set is the expensive part, so callers that
// compare one prompt against many must build each set once rather than letting
// this re-tokenise both sides on every pair.
export function wordSet(text) {
  return new Set(words(text));
}

export function similarityOfSets(A, B) {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

export function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// Grouped integer for anything that reaches the user or the share card. The
// locale is pinned because the UI is English-only: without it a machine set to
// de_DE renders "1.500", which both reads as a different number to the audience
// the card is aimed at and fails the tests that assert the exact string.
export function num(n) {
  return Number(n).toLocaleString("en-US");
}

// Piecewise-linear scale with documented saturation points. Deliberately not a
// fake percentile: this is a threshold rubric, and it says so on the page.
export function scale(value, fullAt) {
  if (fullAt <= 0) return 0;
  return clamp((value / fullAt) * 100);
}
