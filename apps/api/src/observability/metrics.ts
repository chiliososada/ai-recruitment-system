import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';

export type MetricTags = Record<string, string | number>;

/**
 * Vendor-neutral metrics interface (ID-5). The in-memory implementation always records
 * (so `/metrics` works locally and in tests) and optionally forwards to a console/OTel sink.
 * A real OpenTelemetry/Prometheus exporter plugs in behind `METRICS_PROVIDER` without changing
 * call sites.
 */
export interface Metrics {
  increment(name: string, tags?: MetricTags): void;
  observe(name: string, valueMs: number, tags?: MetricTags): void;
  gauge(name: string, value: number, tags?: MetricTags): void;
  time<T>(name: string, fn: () => Promise<T>, tags?: MetricTags): Promise<T>;
  /** Prometheus text exposition for the `/metrics` endpoint. */
  render(): string;
}

function keyOf(name: string, tags?: MetricTags): string {
  if (!tags || Object.keys(tags).length === 0) return name;
  const parts = Object.entries(tags)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '')}"`);
  return `${name}{${parts.join(',')}}`;
}

class InMemoryMetrics implements Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly timings = new Map<string, { count: number; sumMs: number; maxMs: number }>();

  constructor(
    private readonly sink: 'noop' | 'console' | 'otel',
    private readonly log: Logger,
  ) {}

  increment(name: string, tags?: MetricTags): void {
    const k = keyOf(name, tags);
    this.counters.set(k, (this.counters.get(k) ?? 0) + 1);
    if (this.sink !== 'noop') this.log.debug({ metric: name, tags, type: 'counter' });
  }

  gauge(name: string, value: number, tags?: MetricTags): void {
    this.gauges.set(keyOf(name, tags), value);
  }

  observe(name: string, valueMs: number, tags?: MetricTags): void {
    const k = keyOf(name, tags);
    const t = this.timings.get(k) ?? { count: 0, sumMs: 0, maxMs: 0 };
    t.count += 1;
    t.sumMs += valueMs;
    t.maxMs = Math.max(t.maxMs, valueMs);
    this.timings.set(k, t);
  }

  async time<T>(name: string, fn: () => Promise<T>, tags?: MetricTags): Promise<T> {
    const start = Date.now();
    try {
      const out = await fn();
      this.observe(name, Date.now() - start, { ...tags, outcome: 'ok' });
      return out;
    } catch (err) {
      this.observe(name, Date.now() - start, { ...tags, outcome: 'error' });
      throw err;
    }
  }

  render(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters) lines.push(`${k} ${v}`);
    for (const [k, v] of this.gauges) lines.push(`${k} ${v}`);
    for (const [k, t] of this.timings) {
      const brace = k.indexOf('{');
      const name = brace === -1 ? k : k.slice(0, brace);
      const rest = brace === -1 ? '' : k.slice(brace);
      lines.push(`${name}_count${rest} ${t.count}`);
      lines.push(`${name}_sum_ms${rest} ${t.sumMs}`);
      lines.push(`${name}_max_ms${rest} ${t.maxMs}`);
    }
    return lines.join('\n') + '\n';
  }
}

export function createMetrics(config: AppConfig, log: Logger): Metrics {
  return new InMemoryMetrics(config.METRICS_PROVIDER, log);
}
