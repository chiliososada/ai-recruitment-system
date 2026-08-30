import { wrapUntrustedDocument } from '@ars/shared';
import { upstreamAiError } from '../../errors.js';
import { SYSTEM_PROMPT } from './llm-prompt.js';
import type { LlmProvider, SkillExtractionRequest } from './types.js';

/**
 * Real OpenAI Chat Completions provider (prod). `response_format: json_object` forces a
 * JSON reply; output is still schema-validated (and retried) by the analysis service,
 * exactly like the Anthropic provider (FR-03.2).
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly providerName = 'openai';
  readonly promptVersion = 'v1';
  constructor(
    private readonly apiKey: string,
    readonly modelVersion: string,
  ) {}

  async analyzeResume(req: SkillExtractionRequest): Promise<unknown> {
    const userContent =
      `Analyze this resume and write all human-readable text in locale "${req.locale}".\n` +
      `${wrapUntrustedDocument(req.resumeText)}\nRespond with JSON only.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelVersion,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    if (!res.ok) throw upstreamAiError(`OpenAI API error: ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw upstreamAiError('OpenAI returned no JSON object');
    try {
      return JSON.parse(match[0]);
    } catch {
      throw upstreamAiError('OpenAI returned invalid JSON');
    }
  }
}
