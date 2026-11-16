import { expect, test } from '@playwright/test';
import { wordsInRun } from '../../src/page/word-split.ts';

/** The letters, marks and digits of a text, without its spaces and signs. */
const lettersOf = (text: string) => text.replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/**
 * Checks what a word split must give in any ICU version, not the exact words of its dictionary: more than one word,
 * each one the piece of the run at its start, in order, and together all letters of the run.
 */
function expectSplit(run: string): void {
  const words = wordsInRun(run);
  expect(words.length, run).toBeGreaterThan(1);
  let end = 0;
  for (const { text, start } of words) {
    expect(run.slice(start, start + text.length), run).toBe(text);
    expect(start, run).toBeGreaterThanOrEqual(end);
    end = start + text.length;
  }
  expect(words.map((word) => word.text).join(''), run).toBe(lettersOf(run));
}

test.describe('a run with no character of Han, Hiragana, Katakana, Thai, Lao, Khmer or Myanmar comes back whole', () => {
  test('in English', () => {
    expect(wordsInRun('Restore')).toEqual([{ text: 'Restore', start: 0 }]);
    expect(wordsInRun('day.')).toEqual([{ text: 'day.', start: 0 }]);
  });

  test('in Korean, which puts spaces between words', () => {
    expect(wordsInRun('백업은')).toEqual([{ text: '백업은', start: 0 }]);
  });

  test('as a joined word', () => {
    for (const run of ['Ctrl+R', 'REQ-2.1', 'BACKUP_AGENT_KEY', 'C++']) expect(wordsInRun(run)).toEqual([{ text: run, start: 0 }]);
  });
});

test.describe('a run with a character of those scripts gives each word with its start in the run', () => {
  test('in Chinese', () => {
    expect(wordsInRun('备份文件每天运行')).toEqual([
      { text: '备份', start: 0 },
      { text: '文件', start: 2 },
      { text: '每天', start: 4 },
      { text: '运行', start: 6 },
    ]);
  });

  test('in Japanese', () => {
    expectSplit('ファイルを毎日バックアップします');
  });

  test('in Thai', () => {
    expectSplit('การสำรองข้อมูลทำงานทุกวัน');
  });

  test('in Lao, Khmer and Burmese', () => {
    for (const run of ['ສຳຮອງຂໍ້ມູນທຸກມື້', 'ការបម្រុងទុកដំណើរការរាល់ថ្ងៃ', 'အရန်ကူးခြင်းနေ့တိုင်းလုပ်သည်']) expectSplit(run);
  });

  test('a sign such as 。 or 、 gives no word', () => {
    expect(wordsInRun('备份文件、每天运行。')).toEqual([
      { text: '备份', start: 0 },
      { text: '文件', start: 2 },
      { text: '每天', start: 5 },
      { text: '运行', start: 7 },
    ]);
    expectSplit('ファイルを毎日バックアップします。');
  });
});
