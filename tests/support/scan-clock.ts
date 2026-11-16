const SERVER_FILE = /[\\/]src[\\/]server[\\/]server\.ts/;
const fromServer = () => SERVER_FILE.test(new Error().stack ?? '');

interface Timer {
  due: number;
  run: () => void;
}

export interface ScanClock {
  /** Moves the clock of the server on, and runs each timer that this makes due. */
  advance(ms: number): void;
  /** Resolves when the server next sets its scan timer, which it does for each change it hears of. */
  nextTimer(): Promise<void>;
  /** How many scan timers have run. */
  fired(): number;
  restore(): void;
}

/**
 * Gives the server a clock that moves only when a test says so. Its scan timer then runs at a
 * chosen step of the test, on a fast and a slow machine alike. All other code keeps the real clock.
 */
export function takeScanClock(): ScanClock {
  const real = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, now: Date.now };
  const timers = new Set<Timer>();
  let now = real.now();
  let fired = 0;
  let waiting: (() => void)[] = [];

  globalThis.setTimeout = ((run: () => void, ms = 0, ...rest: []) => {
    if (!fromServer()) return real.setTimeout(run, ms, ...rest);
    const timer = { due: now + ms, run };
    timers.add(timer);
    for (const wake of waiting.splice(0)) wake();
    return timer;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((timer: NodeJS.Timeout) => {
    if (!timers.delete(timer as unknown as Timer)) real.clearTimeout(timer);
  }) as typeof clearTimeout;
  Date.now = () => (fromServer() ? now : real.now());

  return {
    advance(ms) {
      now += ms;
      for (const timer of [...timers]) {
        if (timer.due > now) continue;
        timers.delete(timer);
        fired++;
        timer.run();
      }
    },
    nextTimer: () => new Promise((resolve) => waiting.push(resolve)),
    fired: () => fired,
    restore() {
      globalThis.setTimeout = real.setTimeout;
      globalThis.clearTimeout = real.clearTimeout;
      Date.now = real.now;
      waiting = [];
    },
  };
}
