import { newAuthorKey } from '../server/author.ts';
import { startServer } from '../server/server.ts';
import { chooseFolder, parseArgs } from './args.ts';
import { assets, diagrams, fonts } from './assets.ts';
import { openBrowser } from './open-browser.ts';
import { errorLine, TerminalError } from './terminal-error.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const folder = chooseFolder(args.folder, process.cwd());
  const log = (line: string) => console.error(line);

  const authorKey = newAuthorKey();
  const server = await startServer({ folder, port: args.port, assets, fonts, diagrams, authorKey, log });
  const authorAddress = server.authorAddress!;

  // Ctrl+C works from the moment that the address shows.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }

  console.log(`Folder: ${folder}`);
  console.log(`Pages: ${server.pageCount}`);
  console.log(`Address: ${server.address}`);
  console.log(`Author address: ${authorAddress}`);

  // The browser that the command opens is the author browser.
  if (args.open) {
    openBrowser(authorAddress, () => log(errorLine('Cannot open browser', authorAddress)));
  }
}

main().catch((error: Error) => {
  console.error(error instanceof TerminalError ? error.message : errorLine('Server failure', error.message));
  process.exit(1);
});
