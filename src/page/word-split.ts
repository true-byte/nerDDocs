/** A word of a run of text, with where it starts in the run. */
export interface RunWord {
  text: string;
  start: number;
}

/** The scripts of Chinese, Japanese, Thai, Lao, Khmer and Burmese, which put no spaces between words. */
const NO_SPACE_SCRIPTS = ['Han', 'Hiragana', 'Katakana', 'Thai', 'Lao', 'Khmer', 'Myanmar'];
const NO_SPACES = new RegExp(`[${NO_SPACE_SCRIPTS.map((script) => `\\p{Script=${script}}`).join('')}]`, 'u');

let segmenter: Intl.Segmenter | undefined;

/**
 * The words of a run of text that holds no space. A run with no character of a script that puts no spaces between
 * words is one word. Any other run gives each word that `Intl.Segmenter` finds in it.
 */
export function wordsInRun(run: string): RunWord[] {
  if (!NO_SPACES.test(run)) return [{ text: run, start: 0 }];
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'word' });
  const words: RunWord[] = [];
  for (const { segment, index, isWordLike } of segmenter.segment(run)) {
    if (isWordLike) words.push({ text: segment, start: index });
  }
  return words;
}
