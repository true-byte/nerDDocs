/** A style rule or an at-rule of a style sheet, with the at-rules around it, such as `@media (min-width: 960px)`. */
export interface CssRule {
  at: string[];
  /** The selector list of a style rule, or the head of an at-rule, such as `@font-face` or `@keyframes blink`. */
  selector: string;
  /** The text between the braces. */
  body: string;
}

/** The index after the quoted text that starts at `start`. */
function afterQuote(text: string, start: number): number {
  const quote = text[start];
  let at = start + 1;
  while (at < text.length && text[at] !== quote) at += text[at] === '\\' ? 2 : 1;
  return at + 1;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let at = open; at < text.length; ) {
    const char = text[at];
    if (char === '"' || char === "'") {
      at = afterQuote(text, at);
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return at;
    at++;
  }
  throw new Error(`A brace at ${open} has no end.`);
}

/** Splits text at each separator outside quotes, parentheses and brackets. */
export function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < text.length; ) {
    const char = text[at]!;
    if (char === '"' || char === "'") {
      at = afterQuote(text, at);
      continue;
    }
    if ('([{'.includes(char)) depth++;
    if (')]}'.includes(char)) depth--;
    if (char === separator && depth === 0) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
    at++;
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

export const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const GROUPS = /^@(media|supports|container|layer)\b/;

/** Every rule of a style sheet. The rules inside `@media`, `@supports`, `@container` and `@layer` come out one by one. */
export function cssRules(css: string, at: string[] = []): CssRule[] {
  const text = withoutComments(css);
  const rules: CssRule[] = [];
  let start = 0;
  for (;;) {
    let open = start;
    while (open < text.length && text[open] !== '{') {
      open = text[open] === '"' || text[open] === "'" ? afterQuote(text, open) : open + 1;
    }
    if (open >= text.length) return rules;
    const head = text.slice(start, open);
    // A statement such as `@import url(art.css);` can come before the rule.
    const selector = head.slice(head.lastIndexOf(';') + 1).trim();
    const close = matchingBrace(text, open);
    const body = text.slice(open + 1, close);
    if (GROUPS.test(selector)) rules.push(...cssRules(body, [...at, selector]));
    else rules.push({ at, selector, body });
    start = close + 1;
  }
}

/** The declarations of a rule body, by property name. */
export function declarations(body: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const declaration of splitTop(body, ';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) found.set(declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim());
  }
  return found;
}

/** One selector with single spaces and double quotes around each `data-theme` and `data-mode` value. */
export function normalSelector(selector: string): string {
  return selector
    .replace(/\s+/g, ' ')
    .replace(/\[\s*(data-theme|data-mode)\s*=\s*(["']?)([^"'\]\s]*)\2\s*\]/g, '[$1="$3"]')
    .trim();
}

export const selectorsOf = (rule: CssRule) => splitTop(rule.selector, ',').map(normalSelector);

/** The value inside a `url()`, with no quotes. */
export function urlsIn(css: string): string[] {
  return [...withoutComments(css).matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/g)].map(
    (match) => match[1] ?? match[2] ?? match[3] ?? '',
  );
}

/** A hex color as the browser gives it back, such as `rgb(29, 39, 48)`. */
export function rgbOf(hex: string): string {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
