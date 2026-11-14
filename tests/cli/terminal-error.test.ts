import { expect, test } from '@playwright/test';
import { errorLine, TerminalError, type ErrorName, type ProblemName } from '../../src/cli/terminal-error.ts';

/** Every name of each closed list. The type check fails when a list gains or loses a name. */
const PROBLEM_NAMES = [
  'Missing config',
  'Bad config',
  'Cannot read',
  'Duplicate page',
  'Unknown level',
  'Unknown icon',
  'Missing dimension',
  'Outside dimensions',
  'Missing file',
  'Bad OpenAPI',
  'Unresolved ref',
  'Unknown tag',
  'Missing page',
  'Missing heading',
  'Empty page',
  'Empty heading',
] as const satisfies readonly ProblemName[];

const ERROR_NAMES = [
  'Unknown flag',
  'Bad port',
  'Too many folders',
  'Missing folder',
  'Not a folder',
  'No free port',
  'Port refused',
  'Cannot open browser',
  'Cannot watch',
  'Cannot open editor',
  'Server failure',
] as const satisfies readonly ErrorName[];

type Every<Listed, All> = [Exclude<All, Listed>] extends [never] ? true : false;
const everyProblem: Every<(typeof PROBLEM_NAMES)[number], ProblemName> = true;
const everyError: Every<(typeof ERROR_NAMES)[number], ErrorName> = true;
/** No name is both a problem and a command error. */
const noShared: [Extract<ProblemName, ErrorName>] extends [never] ? true : false = true;

test('the closed list of problems and the closed list of command errors share no name', () => {
  expect([everyProblem, everyError, noShared]).toEqual([true, true, true]);
  expect(new Set([...PROBLEM_NAMES, ...ERROR_NAMES]).size).toBe(PROBLEM_NAMES.length + ERROR_NAMES.length);
});

test('a command error is one line: its name, a colon and the value', () => {
  expect(errorLine('Cannot open editor', 'docs/user-guide/restore.md')).toBe('Cannot open editor: docs/user-guide/restore.md');
  expect(new TerminalError('Missing folder', 'backups').message).toBe('Missing folder: backups');
  // @ts-expect-error A problem prints as a block, never as a command error line.
  errorLine('Missing file', 'restore-window.png');
});
