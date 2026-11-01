import { realpath, stat } from 'node:fs/promises';
import { extname, join, sep } from 'node:path';
import { isPublicName } from '../site/names.ts';
import { isPublicPath } from '../site/scan.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
};

export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** The decoded path of a request, or null when it cannot name a public file. */
export function publicUrlPath(requestUrl: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (path.includes('\0') || (sep === '\\' && path.includes('\\'))) return null;
  const parts = path.split('/').slice(1);
  if (parts.some((part) => part !== '' && !isPublicName(part))) return null;
  return path;
}

/** The real file behind a public path, only when it stays inside the folder. */
export async function findPublicFile(folder: string, urlPath: string): Promise<string | null> {
  try {
    const [root, file] = await Promise.all([realpath(folder), realpath(join(folder, urlPath))]);
    if (!isPublicPath(root, file)) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch {
    return null;
  }
}
