// On-device "predict the recipient account from a transaction title"
// classifier — powers the auto-suggested "to" account in TransactionForm.
// Deliberately not a neural net: a user's own transaction history is a few
// dozen to a few hundred examples, often zero for a brand-new install, and
// a title like "Whole Foods" recurring verbatim is exactly what a small
// bag-of-words model is good at. A multinomial Naive Bayes classifier
// trained fresh from `transactions` on every call is instant (no
// epochs/gradient descent, just counting), has no bundle-size or
// per-platform runtime cost beyond plain TypeScript, and degrades
// gracefully to "no suggestion" with little or no history — see the
// conversation this was designed in for the fuller rationale. Pure
// functions only, per project rule #3 — components call these, they don't
// reimplement the math.
import type { Transaction } from '@/types/ledger';

// Small stopword list — common filler words that appear across every
// account and would otherwise dilute the signal from the words that
// actually distinguish one merchant/category from another.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'at', 'in', 'on',
  'with', 'from', 'by', 'is', 'it', 'this', 'that'
]);

export function tokenize(title: string): string[] {
  return String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

// Case/whitespace-insensitive key used for the exact-title fast path below
// — distinct from tokenize() because word order and stopwords still matter
// for "is this literally the same title as before", even though they don't
// for the bag-of-words scoring.
function normalizeTitle(title: string): string {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Lidstone (additive) smoothing constant for the bag-of-words model. Add-1
// (Laplace) smoothing is the textbook default but is too aggressive for a
// vocabulary this small — with only a few dozen examples and a dozen or so
// accounts, the "+1" given to every account for every word it's *never*
// seen ends up competing with real signal, capping confidence well below
// what an exact repeat title intuitively deserves. 0.1 keeps smoothing's
// job (never assigning a word/account pair exactly zero probability)
// without drowning out the accounts that actually matter.
const SMOOTHING_ALPHA = 0.1;

export interface TitleAccountModel {
  /** word -> accountId -> occurrence count across every historical title. */
  wordCounts: Map<string, Map<string, number>>;
  /** accountId -> total word occurrences (with repeats) across its titles. */
  accountWordTotals: Map<string, number>;
  /** accountId -> number of transactions that landed there. */
  accountDocCounts: Map<string, number>;
  /** normalizeTitle(title) -> accountId -> occurrence count — backs the
   * exact-title-match fast path, kept separate from the tokenized
   * wordCounts above since it cares about the whole title, not per-word
   * frequency. */
  titleAccountCounts: Map<string, Map<string, number>>;
  /** Distinct token vocabulary size, for Laplace/Lidstone smoothing. */
  vocabSize: number;
  /** Total transactions the model was built from. */
  totalDocs: number;
}

// Builds the frequency tables Naive Bayes needs. Cheap enough to call on
// every render via useMemo(transactions) — it's a single pass over the
// transaction list, no iteration happens per-keystroke.
export function buildTitleAccountModel(transactions: Transaction[]): TitleAccountModel {
  const wordCounts = new Map<string, Map<string, number>>();
  const accountWordTotals = new Map<string, number>();
  const accountDocCounts = new Map<string, number>();
  const titleAccountCounts = new Map<string, Map<string, number>>();
  const vocab = new Set<string>();
  let totalDocs = 0;

  for (const t of transactions) {
    if (!t.title || !t.to) continue;
    const tokens = tokenize(t.title);
    if (!tokens.length) continue;

    totalDocs++;
    accountDocCounts.set(t.to, (accountDocCounts.get(t.to) ?? 0) + 1);
    accountWordTotals.set(t.to, (accountWordTotals.get(t.to) ?? 0) + tokens.length);

    for (const word of tokens) {
      vocab.add(word);
      let byAccount = wordCounts.get(word);
      if (!byAccount) { byAccount = new Map(); wordCounts.set(word, byAccount); }
      byAccount.set(t.to, (byAccount.get(t.to) ?? 0) + 1);
    }

    const normTitle = normalizeTitle(t.title);
    let titleByAccount = titleAccountCounts.get(normTitle);
    if (!titleByAccount) { titleByAccount = new Map(); titleAccountCounts.set(normTitle, titleByAccount); }
    titleByAccount.set(t.to, (titleByAccount.get(t.to) ?? 0) + 1);
  }

  return { wordCounts, accountWordTotals, accountDocCounts, titleAccountCounts, vocabSize: vocab.size, totalDocs };
}

// Exact (case/whitespace-insensitive) repeat of a previous title is
// stronger, more specific evidence than the general bag-of-words model can
// express — "you typed exactly this before and it always went to account
// X" shouldn't be diluted by every *other* account the smoothing term
// gives a sliver of probability to. Uses a Krichevsky–Trofimov-style
// estimate ((successes + 0.5) / (total + 1)) rather than a raw ratio, so a
// single prior example starts high (75%) but doesn't claim false
// certainty, and confidence climbs as repeats accumulate (2-for-2 -> 83%,
// 3-for-3 -> 87.5%, ...). A title that's historically gone to *different*
// accounts naturally lands back near 50/50, same as the general model.
export function exactTitleMatch(model: TitleAccountModel, title: string): AccountSuggestion | null {
  const norm = normalizeTitle(title);
  if (!norm) return null;
  const byAccount = model.titleAccountCounts.get(norm);
  if (!byAccount || byAccount.size === 0) return null;

  let bestAccount = '';
  let bestCount = 0;
  let total = 0;
  for (const [accountId, count] of byAccount) {
    total += count;
    if (count > bestCount) { bestCount = count; bestAccount = accountId; }
  }

  return { accountId: bestAccount, confidence: (bestCount + 0.5) / (total + 1) };
}

export interface AccountSuggestion {
  accountId: string;
  /** 0-1, softmax-normalized across candidate accounts — a relative
   * confidence ("how much more likely this account is than the others
   * given the title"), not a calibrated probability. */
  confidence: number;
}

// Ranks every account the model has seen by P(account | title's words),
// via Lidstone-smoothed (see SMOOTHING_ALPHA) multinomial Naive Bayes:
//   P(account | words) ∝ P(account) * ∏ P(word | account)
// then folds in the exact-title fast path (exactTitleMatch) on top, since
// "you typed exactly this before" is more specific evidence than the
// bag-of-words model alone can express. Returns [] when there's no usable
// signal at all — empty history, an empty/unrecognized title, or
// (deliberately) when none of the title's words have ever been seen
// before, so the model doesn't fall back to just suggesting whichever
// account is most common overall.
export function rankToAccounts(model: TitleAccountModel, title: string): AccountSuggestion[] {
  const tokens = tokenize(title);
  if (!tokens.length || model.totalDocs === 0) return [];
  if (!tokens.some(w => model.wordCounts.has(w))) return [];

  const scored: { accountId: string; logProb: number }[] = [];
  for (const [accountId, docCount] of model.accountDocCounts) {
    const wordTotal = model.accountWordTotals.get(accountId) ?? 0;
    let logProb = Math.log(docCount / model.totalDocs);
    for (const word of tokens) {
      const count = model.wordCounts.get(word)?.get(accountId) ?? 0;
      const prob = (count + SMOOTHING_ALPHA) / (wordTotal + SMOOTHING_ALPHA * model.vocabSize);
      logProb += Math.log(prob);
    }
    scored.push({ accountId, logProb });
  }

  const maxLog = Math.max(...scored.map(s => s.logProb));
  const exps = scored.map(s => Math.exp(s.logProb - maxLog));
  const sumExp = exps.reduce((a, b) => a + b, 0);

  const ranked = scored.map((s, i) => ({ accountId: s.accountId, confidence: exps[i] / sumExp }));

  const exact = exactTitleMatch(model, title);
  if (exact) {
    const existing = ranked.find(r => r.accountId === exact.accountId);
    if (existing) existing.confidence = Math.max(existing.confidence, exact.confidence);
    else ranked.push(exact);
  }

  return ranked.sort((a, b) => b.confidence - a.confidence);
}

// Convenience wrapper for the common case: "is there one clear best guess
// worth auto-filling?" `minConfidence` defaults to 0.5 — stricter than
// "just the top of the list" so a title that's genuinely ambiguous between
// two accounts (confidences close together) doesn't silently auto-fill the
// wrong one.
export function suggestToAccount(model: TitleAccountModel, title: string, minConfidence = 0.5): AccountSuggestion | null {
  const [best] = rankToAccounts(model, title);
  if (!best || best.confidence < minConfidence) return null;
  return best;
}
