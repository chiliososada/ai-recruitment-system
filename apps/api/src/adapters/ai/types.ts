import type { Locale } from '@ars/shared';

export interface SkillExtractionRequest {
  resumeText: string;
  locale: Locale;
}

/**
 * Pluggable LLM provider (FR-03, NFR-AI). Returns RAW parsed JSON; the analysis service
 * validates it against SkillAnalysisResultSchema and retries/falls back on mismatch, so a
 * bad/injected model response can never corrupt persisted data (FR-02.6, FR-03.2).
 */
export interface LlmProvider {
  readonly providerName: string;
  readonly modelVersion: string;
  readonly promptVersion: string;
  analyzeResume(req: SkillExtractionRequest): Promise<unknown>;
}

/** Pluggable embedding provider (FR-05.1). Mock is deterministic; OpenAI is the real impl. */
export interface EmbeddingProvider {
  readonly providerName: string;
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}
