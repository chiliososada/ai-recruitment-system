import type { AppConfig } from '../../config.js';
import { AnthropicLlmProvider } from './anthropic-llm.js';
import { MockEmbeddingProvider, OpenAiEmbeddingProvider } from './embedding.js';
import { MockLlmProvider } from './mock-llm.js';
import { OpenAiLlmProvider } from './openai-llm.js';
import type { EmbeddingProvider, LlmProvider } from './types.js';

export function createLlmProvider(config: AppConfig): LlmProvider {
  if (config.AI_PROVIDER === 'anthropic' && config.ANTHROPIC_API_KEY) {
    return new AnthropicLlmProvider(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL);
  }
  if (config.AI_PROVIDER === 'openai' && config.OPENAI_API_KEY) {
    return new OpenAiLlmProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL);
  }
  return new MockLlmProvider();
}

export function createEmbeddingProvider(config: AppConfig): EmbeddingProvider {
  if (config.EMBEDDING_PROVIDER === 'openai' && config.OPENAI_API_KEY) {
    return new OpenAiEmbeddingProvider(
      config.OPENAI_API_KEY,
      config.OPENAI_EMBEDDING_MODEL,
      config.EMBEDDING_DIMENSIONS,
    );
  }
  return new MockEmbeddingProvider(config.EMBEDDING_DIMENSIONS);
}

export type { LlmProvider, EmbeddingProvider, SkillExtractionRequest } from './types.js';
