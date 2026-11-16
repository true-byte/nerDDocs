import { randomBytes, timingSafeEqual } from 'node:crypto';

/** A new key: 24 random bytes in base64url. */
export function newAuthorKey(): string {
  return randomBytes(24).toString('base64url');
}

/** The name of the author cookie of the command on this port. */
export function authorCookie(port: number): string {
  return `nerddocs-author-${port}`;
}

/** True when the Cookie header holds the author cookie of this port with this key. */
export function isAuthor(cookieHeader: string | undefined, port: number, key: string | null): boolean {
  if (!key || !cookieHeader) return false;
  const name = authorCookie(port);
  const wanted = Buffer.from(key);
  return cookieHeader.split(';').some((pair) => {
    const at = pair.indexOf('=');
    if (at < 0 || pair.slice(0, at).trim() !== name) return false;
    const value = Buffer.from(pair.slice(at + 1).trim());
    return value.length === wanted.length && timingSafeEqual(value, wanted);
  });
}
