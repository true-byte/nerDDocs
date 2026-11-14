/** Each problem of the docs is one of these names. `problemBlock` of `problem-block.ts` prints it. */
export type ProblemName =
  | 'Missing config'
  | 'Bad config'
  | 'Cannot read'
  | 'Duplicate page'
  | 'Unknown level'
  | 'Unknown icon'
  | 'Missing dimension'
  | 'Outside dimensions'
  | 'Missing file'
  | 'Bad OpenAPI'
  | 'Unresolved ref'
  | 'Unknown tag'
  | 'Missing page'
  | 'Missing heading'
  | 'Empty page'
  | 'Empty heading';

/** The names in the order of `ProblemName`, which orders the problems at one line and column. */
export const PROBLEM_NAMES: readonly ProblemName[] = [
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
];

/** Each command error line is one of these names, then a colon and the value. */
export type ErrorName =
  | 'Unknown flag'
  | 'Bad port'
  | 'Too many folders'
  | 'Missing folder'
  | 'Not a folder'
  | 'No free port'
  | 'Port refused'
  | 'Cannot open browser'
  | 'Cannot watch'
  | 'Cannot open editor'
  | 'Server failure';

export function errorLine(name: ErrorName, value: string): string {
  return `${name}: ${value}`;
}

export class TerminalError extends Error {
  constructor(name: ErrorName, value: string) {
    super(errorLine(name, value));
  }
}
