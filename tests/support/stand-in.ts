import type { Mode } from '../../src/themes/types.ts';

/** A stand-in for `<html>` that writes its attributes into `attributes`, by `setAttribute` or by `dataset`. */
export function standInRoot(attributes: Record<string, string>) {
  return {
    setAttribute: (name: string, value: string) => (attributes[name] = String(value)),
    getAttribute: (name: string) => attributes[name] ?? null,
    removeAttribute: (name: string) => delete attributes[name],
    hasAttribute: (name: string) => name in attributes,
    dataset: new Proxy({} as Record<string, string>, {
      get: (_, key: string) => attributes[`data-${key}`],
      set: (_, key: string, value: string) => ((attributes[`data-${key}`] = String(value)), true),
    }),
  };
}

/** The `matchMedia` of a computer set to the light or the dark look, for the `prefers-color-scheme` queries. */
export function computerSetTo(look: Mode) {
  return (query: string) => {
    const asked = /prefers-color-scheme\s*:\s*(light|dark)/.exec(query)?.[1];
    return {
      media: query,
      matches: asked === look,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    };
  };
}
