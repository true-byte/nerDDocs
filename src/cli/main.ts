import { startServer } from '../server/server.ts';
import { chooseFolder, parseArgs } from './args.ts';
import { assets } from './assets.ts';
import { openBrowser } from './open-browser.ts';
import { errorLine, TerminalError } from './terminal-error.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const folder = chooseFolder(args.folder, process.cwd());
  const log = (line: string) => console.error(line);

  const server = await startServer({ folder, port: args.port, assets, log });

  // Ctrl+C works from the moment that the address shows.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void server.close().then(() => process.exit(0));
    });
  }

  console.log(`Folder: ${folder}`);
  console.log(`Pages: ${server.pageCount}`);
  console.log(`Address: ${server.address}`);

  if (args.open) {
    openBrowser(server.address, () => log(errorLine('Cannot open browser', server.address)));
  }
}

main().catch((error: Error) => {
  console.error(error instanceof TerminalError ? error.message : errorLine('Server failure', error.message));
  process.exit(1);
});
