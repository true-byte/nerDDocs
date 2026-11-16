import { expect, test } from '@playwright/test';
import { carryValue, readCarry } from '../../src/page/carry.ts';

/** The settings of a reader of the backup app, as each storage holds them. */
const LOCAL = { 'nerddocs-theme': 'im-in', 'nerddocs-mode': 'dark', 'nerddocs-default-level': 'pro', 'nerddocs-text-width': '80' };
const SESSION = { 'nerddocs-page-levels': '{"/guide/restore.html":{"level":"full-nerd","live":["casual","pro","full-nerd"]}}' };

test('the nd value is the JSON of the entries of each storage, encoded for an address', () => {
  expect(carryValue(LOCAL, SESSION)).toBe(encodeURIComponent(JSON.stringify({ l: LOCAL, s: SESSION })));
  expect(carryValue({}, {})).toBe(encodeURIComponent('{"l":{},"s":{}}'));
});

test('readCarry gives back the entries that carryValue carries, with any character in a value', () => {
  const session = {
    'nerddocs-found': JSON.stringify({ url: '/admin/storage.html', text: 'Restore 100% of a file & keep #3?', query: ['100%'], matched: ['100%'] }),
    'nerddocs-shut': '["guide/plans"]',
    'nerddocs-panel-scroll': 'Ünïcode 復元 ✓',
  };
  expect(readCarry(carryValue(LOCAL, session))).toEqual({ local: LOCAL, session });
  expect(readCarry(carryValue({}, {}))).toEqual({ local: {}, session: {} });
});

test('the carry holds every key of each storage that starts with nerddocs-, except nerddocs-sizes', () => {
  const local = {
    'nerddocs-theme': 'im-in',
    'nerddocs-sizes': '[["wireframe guide/wireframes/restore-wizard.html",420]]',
    'wizard-theme': 'dark',
    'NERDDOCS-theme': 'original-nerd',
    'nerddocs-probe': 'kept',
  };
  const session = { 'nerddocs-found': '{}', 'nerddocs-sizes': '[]', 'restore-step': '2' };
  const kept = { local: { 'nerddocs-theme': 'im-in', 'nerddocs-probe': 'kept' }, session: { 'nerddocs-found': '{}' } };
  expect(carryValue(local, session)).toBe(encodeURIComponent(JSON.stringify({ l: kept.local, s: kept.session })));
  expect(readCarry(carryValue(local, session))).toEqual(kept);
});

test('readCarry drops each key of a value made by hand that is not a nerddocs- key or is nerddocs-sizes', () => {
  const value = encodeURIComponent(
    JSON.stringify({
      l: { 'nerddocs-theme': 'im-in', evil: 'written', 'nerddocs-sizes': '[["wireframe guide/wireframes/restore-wizard.html",9999]]' },
      s: { 'nerddocs-found': '{}', evil: 'written', 'NERDDOCS-found': '{}', 'nerddocs-sizes': '[]' },
    }),
  );
  expect(readCarry(value)).toEqual({ local: { 'nerddocs-theme': 'im-in' }, session: { 'nerddocs-found': '{}' } });
});

test('a value that is not an nd value gives null', () => {
  const values = [
    '',
    'restore',
    encodeURIComponent('{"l":{},"s":'),
    encodeURIComponent('null'),
    encodeURIComponent('[]'),
    encodeURIComponent('"nerddocs-theme"'),
    encodeURIComponent('{}'),
    encodeURIComponent('{"l":{}}'),
    encodeURIComponent('{"s":{}}'),
    encodeURIComponent('{"l":[],"s":{}}'),
    encodeURIComponent('{"l":{},"s":"nerddocs-found"}'),
    encodeURIComponent('{"l":{"nerddocs-theme":1},"s":{}}'),
  ];
  for (const value of values) expect(readCarry(value), value).toBeNull();
});
