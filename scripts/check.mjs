// Type check, build, then the full tests once and once under CPU load.
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

function step(name, command, args) {
  const start = Date.now();
  console.log(`\n--- ${name}`);
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) {
    console.error(`Check failed: ${name}`);
    process.exit(1);
  }
  console.log(`--- ${name}: ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const start = Date.now();

step('Type check', npx, ['tsc']);
step('Build', npm, ['run', 'build', '--silent']);
step('Tests', npx, ['playwright', 'test']);

// Threads end with this process, also when a signal kills it.
for (let core = 0; core < availableParallelism(); core++) new Worker('for (;;);', { eval: true });
step('Tests under CPU load', npx, ['playwright', 'test']);

console.log(`\nCheck passed: ${((Date.now() - start) / 1000).toFixed(1)} s`);
process.exit(0);
