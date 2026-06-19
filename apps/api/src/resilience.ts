/** Timeout + bounded retry + circuit breaker for external providers (ID-4). */

export type BreakerState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`circuit open: ${name}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private state: BreakerState = 'closed';
  private openedAt = 0;

  constructor(
    private readonly opts: { threshold: number; cooldownMs: number; now?: () => number },
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /** True if a call may proceed (moving open→half_open after cooldown). */
  canPass(): boolean {
    if (this.state === 'open') {
      if (this.now() - this.openedAt >= this.opts.cooldownMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  onFailure(): void {
    this.failures += 1;
    if (this.state === 'half_open' || this.failures >= this.opts.threshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }

  get current(): BreakerState {
    return this.state;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`operation timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface ResilienceOptions {
  timeoutMs: number;
  retries: number;
  breaker?: CircuitBreaker;
  baseDelayMs?: number;
}

/**
 * Run `fn` with a timeout, bounded retries (exponential backoff) and an optional circuit
 * breaker. When the breaker is open, fails fast with `CircuitOpenError` (no side effect).
 */
export async function withResilience<T>(
  name: string,
  fn: () => Promise<T>,
  opts: ResilienceOptions,
): Promise<T> {
  const { breaker } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    if (breaker && !breaker.canPass()) throw new CircuitOpenError(name);
    try {
      const out = await withTimeout(fn(), opts.timeoutMs);
      breaker?.onSuccess();
      return out;
    } catch (err) {
      lastError = err;
      breaker?.onFailure();
      if (attempt < opts.retries) await sleep((opts.baseDelayMs ?? 100) * 2 ** attempt);
    }
  }
  throw lastError;
}
