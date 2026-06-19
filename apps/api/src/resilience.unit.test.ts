import { describe, expect, it } from 'vitest';
import { CircuitBreaker, CircuitOpenError, withResilience } from './resilience.js';

describe('CircuitBreaker (PR-1)', () => {
  it('opens after the failure threshold and recovers via half-open → closed', () => {
    let clock = 0;
    const b = new CircuitBreaker({ threshold: 3, cooldownMs: 1000, now: () => clock });
    expect(b.canPass()).toBe(true);
    b.onFailure();
    b.onFailure();
    expect(b.current).toBe('closed');
    b.onFailure(); // hits threshold
    expect(b.current).toBe('open');
    expect(b.canPass()).toBe(false); // still within cooldown

    clock = 1000; // cooldown elapsed
    expect(b.canPass()).toBe(true); // half-open trial allowed
    expect(b.current).toBe('half_open');
    b.onSuccess();
    expect(b.current).toBe('closed');
  });

  it('re-opens immediately when the half-open trial fails', () => {
    let clock = 0;
    const b = new CircuitBreaker({ threshold: 1, cooldownMs: 100, now: () => clock });
    b.onFailure();
    expect(b.current).toBe('open');
    clock = 100;
    expect(b.canPass()).toBe(true); // half-open
    b.onFailure();
    expect(b.current).toBe('open');
  });
});

describe('withResilience (PR-1)', () => {
  it('retries then succeeds', async () => {
    let calls = 0;
    const result = await withResilience(
      'x',
      async () => {
        calls += 1;
        if (calls < 2) throw new Error('transient');
        return 'ok';
      },
      { timeoutMs: 1000, retries: 3, baseDelayMs: 0 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(2);
  });

  it('throws the last error after exhausting retries', async () => {
    await expect(
      withResilience('x', async () => Promise.reject(new Error('down')), {
        timeoutMs: 1000,
        retries: 1,
        baseDelayMs: 0,
      }),
    ).rejects.toThrow('down');
  });

  it('times out a slow call', async () => {
    await expect(
      withResilience('x', () => new Promise((r) => setTimeout(r, 200)), {
        timeoutMs: 50,
        retries: 0,
      }),
    ).rejects.toThrow(/timed out/);
  });

  it('fails fast with CircuitOpenError when the breaker is open', async () => {
    const breaker = new CircuitBreaker({ threshold: 1, cooldownMs: 60_000 });
    breaker.onFailure(); // open
    await expect(
      withResilience('x', async () => 'should-not-run', {
        timeoutMs: 1000,
        retries: 2,
        breaker,
      }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
