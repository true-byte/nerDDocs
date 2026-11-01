/** Each terminal error line is one of these names, then a colon and the value. */
export type ErrorName =
  | 'Unknown flag'
  | 'Bad port'
  | 'Too many folders'
  | 'Missing folder'
  | 'Not a folder'
  | 'No free port'
  | 'Port refused'
  | 'Cannot open browser'
  | 'Cannot read'
  | 'Cannot watch'
  | 'Duplicate page'
  | 'Bad config'
  | 'Unknown level'
  | 'Unknown icon'
  | 'Server failure';

export function errorLine(name: ErrorName, value: string): string {
  return `${name}: ${value}`;
}

export class TerminalError extends Error {
  constructor(name: ErrorName, value: string) {
    super(errorLine(name, value));
  }
}
