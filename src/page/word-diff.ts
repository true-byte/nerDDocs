/** A run of text of a word diff: text that both copies hold, text that left, or text that came. */
export interface WordPart {
  text: string;
  op: 'same' | 'gone' | 'new';
}

/** Above this many tokens in either text, a diff gives null, so a long block changes as a whole. */
const MAX_TOKENS = 4000;
const TOKEN = /[\p{L}\p{M}\p{N}'-]+|\s+|[^]/gu;

/** Tokens are runs of letters, digits, `'` and `-`, runs of white space, and single other characters. */
export function wordTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/**
 * The longest common run of two lists of tokens, as runs of same, gone and new tokens in order. Where both copies
 * differ, the gone tokens come before the new ones. Null when either list has more than 4000 tokens.
 */
export function diffTokens(before: readonly string[], after: readonly string[]): WordPart[] | null {
  if (before.length > MAX_TOKENS || after.length > MAX_TOKENS) return null;
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  const a = before.slice(head, before.length - tail);
  const b = after.slice(head, after.length - tail);
  const width = b.length + 1;
  // The length of the longest common run of a[i..] and b[j..], at i * width + j.
  const run = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      run[i * width + j] =
        a[i] === b[j] ? run[(i + 1) * width + j + 1]! + 1 : Math.max(run[(i + 1) * width + j]!, run[i * width + j + 1]!);
    }
  }

  const parts: WordPart[] = [];
  const add = (text: string, op: WordPart['op']) => {
    const last = parts.at(-1);
    if (last?.op === op) last.text += text;
    else if (text) parts.push({ text, op });
  };
  add(before.slice(0, head).join(''), 'same');
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      add(a[i++]!, 'same');
      j++;
    } else if (run[(i + 1) * width + j]! >= run[i * width + j + 1]!) add(a[i++]!, 'gone');
    else add(b[j++]!, 'new');
  }
  while (i < a.length) add(a[i++]!, 'gone');
  while (j < b.length) add(b[j++]!, 'new');
  add(before.slice(before.length - tail).join(''), 'same');
  return parts;
}

/** The longest common run of tokens. Null when either text has more than 4000 tokens. */
export function diffWords(before: string, after: string): WordPart[] | null {
  return diffTokens(wordTokens(before), wordTokens(after));
}
