const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Dot names and node_modules are never part of a site. */
export function isPublicName(name: string): boolean {
  return !name.startsWith('.') && name !== 'node_modules';
}

export function isMarkdownName(name: string): boolean {
  return /\.md$/i.test(name);
}

export function stemOf(name: string): string {
  return name.replace(/\.md$/i, '');
}

/** A prefix of up to three digits and then `-`, `_`, `.` or a space only sets the order, when text is left after it. */
const ORDER_PREFIX = /^\d{1,3}[-_. ]+(?=.)/;

/** The name without its order prefix, as the label and the address take it. */
export function withoutOrder(name: string): string {
  return name.replace(ORDER_PREFIX, '');
}

/** The order prefix of a name sets only the order, so the label drops it. */
export function labelFromName(name: string): string {
  const words = withoutOrder(name)
    .replace(/[-_]+/g, ' ')
    .trim();
  // A name with capitals of its own, such as nerDDocs or iPhone, keeps them.
  return words === words.toLowerCase() ? words.charAt(0).toUpperCase() + words.slice(1) : words;
}

function rank(name: string): number {
  if (!isMarkdownName(name)) return 2;
  const stem = stemOf(name).toLowerCase();
  if (stem === 'index') return 0;
  return stem === 'readme' ? 1 : 2;
}

/** File names set the order. An index or README opens its folder, so it comes first. */
export function compareEntries(a: string, b: string): number {
  return (
    rank(a) - rank(b) ||
    collator.compare(stemOf(a), stemOf(b)) ||
    collator.compare(a, b) ||
    (a < b ? -1 : a > b ? 1 : 0)
  );
}
