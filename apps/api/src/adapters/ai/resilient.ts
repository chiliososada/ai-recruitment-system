import { upstreamAiError } from '../../errors.js';
import type { Logger } from '../../logger.js';
import type { Metrics } from '../../observability/metrics.js';
import { CircuitBreaker, CircuitOpenError, withResilience } from '../../resilience.js';
import type { EmbeddingProvider, LlmProvider } from './types.js';

/** Wrap the LLM provider with timeout + retry + circuit breaker + metrics (non-breaking). */
export function resilientLlm(inner: LlmProvider, metrics: Metrics, log: Logger): LlmProvider {
  const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000 });
  return {
    providerName: inner.providerName,
    modelVersion: inner.modelVersion,
    promptVersion: inner.promptVersion,
    analyzeResume: (req) =>
      metrics.time(
        'provider_llm_analyze',
        () =>
          withResilience('llm', () => inner.analyzeResume(req), {
            timeoutMs: 25_000,
            retries: 2,
            breaker,
          }).catch((err) => {
            if (err instanceof CircuitOpenError) {
              log.warn({ provider: inner.providerName }, 'LLM circuit open; failing fast');
              throw upstreamAiError('LLM temporarily unavailable');
            }
            throw err;
          }),
        { provider: inner.providerName },
      ),
  };
}

/** Wrap the embedding provider with timeout + retry + circuit breaker + metrics. */
export function resilientEmbedding(
  inner: EmbeddingProvider,
  metrics: Metrics,
  log: Logger,
): EmbeddingProvider {
  const breaker = new CircuitBreaker({ threshold: 5, cooldownMs: 30_000 });
  return {
    providerName: inner.providerName,
    model: inner.model,
    dimensions: inner.dimensions,
    embed: (text) =>
      metrics.time(
        'provider_embedding',
        () =>
          withResilience('embedding', () => inner.embed(text), {
            timeoutMs: 15_000,
            retries: 2,
            breaker,
          }).catch((err) => {
            if (err instanceof CircuitOpenError) {
              log.warn({ provider: inner.providerName }, 'embedding circuit open; failing fast');
              throw upstreamAiError('Embedding service temporarily unavailable');
            }
            throw err;
          }),
        { provider: inner.providerName },
      ),
  };
}
