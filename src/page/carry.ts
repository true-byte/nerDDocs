import { safeJson } from './first-paint.ts';
import { local, session } from './panel-state.ts';
import { SIZES_KEY } from './stored-sizes.ts';

/**
 * A browser gives each file on disk its own storage, or one storage to each folder, so a page opened from disk forgets
 * what the reader set on another page. A link between two pages on disk carries the settings in this query key.
 */
export const CARRY_KEY = 'nd';
/** Every storage key of nerDDocs starts with this. */
const KEY_START = 'nerddocs-';
/** The sizes of drawings and images stay with each page, since they can outgrow an address. */
const KEPT_HERE = SIZES_KEY;

type Entries = Record<string, string>;

/** True for a key that a carry holds. */
const isCarried = (key: string) => key.startsWith(KEY_START) && key !== KEPT_HERE;

/** The entries whose keys a carry holds. */
function carriedOf(entries: Entries): Entries {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => isCarried(key)));
}

/** The `nd` value that carries these entries of localStorage and sessionStorage. */
export function carryValue(local: Entries, session: Entries): string {
  return encodeURIComponent(JSON.stringify({ l: carriedOf(local), s: carriedOf(session) }));
}

/** The entries of an object whose values are all strings, or null for any other value. */
function entriesOf(value: unknown): Entries | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([, text]) => typeof text === 'string') ? carriedOf(Object.fromEntries(entries)) : null;
}

/**
 * The entries that an `nd` value carries, or null for a value that is not one. A key that a carry never holds is
 * dropped, so a hand-made address writes no other key.
 */
export function readCarry(value: string): { local: Entries; session: Entries } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const local = entriesOf((parsed as { l?: unknown }).l);
  const session = entriesOf((parsed as { s?: unknown }).s);
  return local && session ? { local, session } : null;
}

/** The carried entries of a storage. A storage that throws gives none. */
function storedEntries(storage: () => Storage): Entries {
  try {
    const store = storage();
    const entries: Entries = {};
    for (let at = 0; at < store.length; at++) {
      const key = store.key(at);
      const text = key === null ? null : store.getItem(key);
      if (key !== null && text !== null && isCarried(key)) entries[key] = text;
    }
    return entries;
  } catch {
    return {};
  }
}

const HTML_FILE = /\.html$/i;

/**
 * The address that a link to `href` opens: on a page from disk, a link to another `.html` file on disk gets
 * `?nd=<carryValue>` before its hash. Any other link keeps `href`.
 */
export function carriedHref(href: string): string {
  if (location.protocol !== 'file:') return href;
  let target: URL;
  try {
    target = new URL(href, location.href);
  } catch {
    return href;
  }
  if (target.protocol !== 'file:' || !HTML_FILE.test(target.pathname) || target.pathname === location.pathname) return href;
  const value = carryValue(storedEntries(local), storedEntries(session));
  const base = target.href.slice(0, target.href.length - target.search.length - target.hash.length);
  return `${base}${target.search ? `${target.search}&` : '?'}${CARRY_KEY}=${value}${target.hash}`;
}

/**
 * On a page from disk, a click on a link to another page carries the settings: a plain click, a middle click, and a
 * click with Ctrl, Cmd or another key held. The link takes the carried address from the press of the button until the
 * browser has opened it, so the browser opens the link in its own way, such as in a new tab.
 */
export function watchCarry(): void {
  if (location.protocol !== 'file:') return;
  /** The `href` of each link that holds a carried address now. */
  const own = new Map<HTMLAnchorElement, string>();
  const carry = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = own.get(link) ?? link.getAttribute('href')!;
    const address = new URL(href, document.baseURI).href;
    const carried = carriedHref(address);
    if (carried === address) return;
    own.set(link, href);
    link.setAttribute('href', carried);
  };
  // The browser opens the link within the task of the release, so a timer gives each link its own `href` back after.
  const giveBack = () =>
    setTimeout(() => {
      for (const [link, href] of own) link.setAttribute('href', href);
      own.clear();
    });
  document.addEventListener('mousedown', carry, true);
  document.addEventListener('mouseup', giveBack, true);
  for (const type of ['click', 'auxclick']) {
    document.addEventListener(
      type,
      (event) => {
        carry(event);
        giveBack();
      },
      true,
    );
  }
}

/**
 * The first head script of a page. An address with `?nd=` makes the storage of the page hold the carried entries: it
 * writes each one, and removes each other key that a carry holds. It drops each key that a carry never holds, as
 * `readCarry` does, so a hand-made address writes no other key. A storage that throws is skipped. Then the script
 * removes `?nd=` from the address. A bad value is removed and changes no storage.
 */
export function carryScript(): string {
  return `(function(){var m=/[?&]${CARRY_KEY}=([^&#]*)/.exec(location.search),v=null,a=[],i,s,k,o;if(!m)return;
function c(k){return k.slice(0,${KEY_START.length})===${safeJson(KEY_START)}&&k!==${safeJson(KEPT_HERE)}}
function e(x){if(typeof x!="object"||x===null||Array.isArray(x))return null;for(var k in x)if(Object.prototype.hasOwnProperty.call(x,k)&&typeof x[k]!="string")return null;return x}
try{v=JSON.parse(decodeURIComponent(m[1]))}catch(r){}
if(v&&typeof v=="object"&&e(v.l)&&e(v.s)){a=[[function(){return localStorage},v.l],[function(){return sessionStorage},v.s]]}
for(i=0;i<a.length;i++){try{s=a[i][0]();o=a[i][1];
for(k=s.length-1;k>=0;k--){var n=s.key(k);if(n!==null&&c(n)&&!Object.prototype.hasOwnProperty.call(o,n))s.removeItem(n)}
for(k in o)if(Object.prototype.hasOwnProperty.call(o,k)&&c(k))s.setItem(k,o[k])}catch(r){}}
try{history.replaceState(history.state,"",location.pathname+location.hash)}catch(r){}
})();`;
}
