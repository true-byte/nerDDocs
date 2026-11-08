/** The rules of a page address hash that names a level: `#<level>`, `#<level>/<id>` or `#<id>`. */

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** `hash` may start with '#'. An empty hash gives { level: null, id: null }. */
export function parseHash(hash: string, levelIds: readonly string[]): { level: string | null; id: string | null } {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!text) return { level: null, id: null };
  const cut = text.indexOf('/');
  const head = decodePart(cut < 0 ? text : text.slice(0, cut));
  if (levelIds.includes(head)) {
    const id = cut < 0 ? '' : decodePart(text.slice(cut + 1));
    return { level: head, id: id || null };
  }
  return { level: null, id: decodePart(text) };
}

/** '#overview/pick-a-day', '#overview', '#pick-a-day' or ''. Each part is encoded with encodeURIComponent. */
export function formatHash(level: string | null, id: string | null): string {
  if (level && id) return `#${encodeURIComponent(level)}/${encodeURIComponent(id)}`;
  if (level) return `#${encodeURIComponent(level)}`;
  if (id) return `#${encodeURIComponent(id)}`;
  return '';
}

/**
 * The level at which text that shows at `shows` opens for a reader at `wanted`: `wanted` when `shows` is null or
 * holds it, else the nearest lower level in `shows`, else the nearest higher one.
 */
export function landingLevelFor(shows: string | null, wanted: string, levelIds: readonly string[]): string {
  if (shows === null) return wanted;
  const held = shows.split(' ');
  if (held.includes(wanted)) return wanted;
  const at = levelIds.indexOf(wanted);
  for (let stop = at - 1; stop >= 0; stop--) if (held.includes(levelIds[stop]!)) return levelIds[stop]!;
  for (let stop = at + 1; stop < levelIds.length; stop++) if (held.includes(levelIds[stop]!)) return levelIds[stop]!;
  return wanted;
}
