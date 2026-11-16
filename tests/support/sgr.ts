const SGR = /\x1b\[([\d;]*)m/y;
const COLOR = /^(3[0-7]|9[0-7])$/;

/**
 * The text that a terminal shows for `text`, and for each character of it the SGR codes that are on, sorted and joined
 * by spaces, such as '1 31'. A grouped code such as `\x1b[36;4m` and two codes in a row give the same result.
 */
export function sgrText(text: string): { plain: string; codes: string[] } {
  let plain = '';
  const codes: string[] = [];
  let on = new Set<string>();
  for (let at = 0; at < text.length; ) {
    SGR.lastIndex = at;
    const found = SGR.exec(text);
    if (found) {
      for (const part of (found[1] || '0').split(';')) {
        const code = String(Number(part || '0'));
        if (code === '0') on = new Set();
        else if (code === '22') ['1', '2'].forEach((bold) => on.delete(bold));
        else if (code === '24') on.delete('4');
        else if (code === '39') on = new Set([...on].filter((kept) => !COLOR.test(kept)));
        else {
          if (COLOR.test(code)) on = new Set([...on].filter((kept) => !COLOR.test(kept)));
          on.add(code);
        }
      }
      at = SGR.lastIndex;
      continue;
    }
    plain += text[at];
    codes.push([...on].sort().join(' '));
    at++;
  }
  return { plain, codes };
}

/** The different SGR code sets that the characters of `piece`, but its spaces, take at its first place from `from` on. */
export function styleOf(text: string, piece: string, from = 0): string[] {
  const { plain, codes } = sgrText(text);
  const at = plain.indexOf(piece, from);
  if (at < 0) throw new Error(`'${piece}' is not in ${JSON.stringify(plain)}`);
  const styles = new Set<string>();
  for (let index = at; index < at + piece.length; index++) if (plain[index] !== ' ') styles.add(codes[index]!);
  return [...styles];
}

/** The place of `piece` in the shown text, after `after` when it is given. */
export function placeIn(text: string, piece: string, after?: string): number {
  const { plain } = sgrText(text);
  return plain.indexOf(piece, after === undefined ? 0 : plain.indexOf(after) + after.length);
}
