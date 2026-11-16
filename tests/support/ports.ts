import { createServer, type Server } from 'node:net';
import { test } from '@playwright/test';

/** Tests that ask the system for any free port get one of a higher range, so they stay out of this one. */
const FIRST_PORT = 20_000;
const PORTS_PER_WORKER = 100;

function listenOn(port: number): Promise<Server | null> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(null));
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const closed = (server: Server) => new Promise((resolve) => server.close(resolve));

/** Holds a port busy whose next port is free, and gives the function that lets it go. */
export async function busyPortBeforeFreePort(): Promise<{ port: number; release: () => Promise<unknown> }> {
  const first = FIRST_PORT + test.info().parallelIndex * PORTS_PER_WORKER;
  for (let port = first; port < first + PORTS_PER_WORKER - 1; port++) {
    const busy = await listenOn(port);
    if (!busy) continue;
    const next = await listenOn(port + 1);
    if (next) {
      await closed(next);
      return { port, release: () => closed(busy) };
    }
    await closed(busy);
  }
  throw new Error('Other programs hold all the ports that this test can use.');
}

/** Holds each given port busy, and gives the function that lets them go. A port that another program holds is busy all the same. */
export async function holdBusy(ports: number[]): Promise<() => Promise<unknown>> {
  const servers = await Promise.all(ports.map(listenOn));
  return () => Promise.all(servers.map((server) => server && closed(server)));
}
