import { describe, expect, it } from 'vitest';
import { cosineSimilarity, SkillAnalysisResultSchema, type Locale } from '@ars/shared';
import { loadConfig } from '../../config.js';
import { createLlmProvider } from './index.js';
import { MockLlmProvider } from './mock-llm.js';
import { MockEmbeddingProvider } from './embedding.js';
import { runAnalysis } from '../../services/analysis.js';
import { RealtimeBus } from '../../realtime.js';

const RESUME = [
  'Aoi Tanaka — Senior Software Engineer',
  'Summary: 7 years building products with TypeScript, React, and Node.js.',
  'Skills: TypeScript, React, Node.js, PostgreSQL.',
  'Experience: 7 years of professional software engineering.',
].join('\n');

const LOCALES: Locale[] = ['en', 'ja', 'zh-CN', 'zh-TW'];

describe('MockLlmProvider.analyzeResume (unit, FR-03)', () => {
  it('returns schema-valid output for every supported locale', async () => {
    const llm = new MockLlmProvider();
    for (const locale of LOCALES) {
      const raw = await llm.analyzeResume({ resumeText: RESUME, locale });
      const parsed = SkillAnalysisResultSchema.safeParse(raw);
      expect(parsed.success, `locale ${locale} should be schema-valid`).toBe(true);
      expect(parsed.success && parsed.data.locale).toBe(locale);
    }
  });

  it('is deterministic — identical input yields deep-equal output', async () => {
    const llm = new MockLlmProvider();
    const a = await llm.analyzeResume({ resumeText: RESUME, locale: 'en' });
    const b = await llm.analyzeResume({ resumeText: RESUME, locale: 'en' });
    expect(a).toEqual(b);
  });

  it('detects the named skills and total years of experience', async () => {
    const llm = new MockLlmProvider();
    const parsed = SkillAnalysisResultSchema.parse(
      await llm.analyzeResume({ resumeText: RESUME, locale: 'en' }),
    );
    const names = parsed.skills.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['TypeScript', 'React', 'Node.js']));
    expect(parsed.totalYearsExperience).toBe(7);
  });

  it('localizes the summary (ja → 年, en → "years")', async () => {
    const llm = new MockLlmProvider();
    const ja = SkillAnalysisResultSchema.parse(
      await llm.analyzeResume({ resumeText: RESUME, locale: 'ja' }),
    );
    const en = SkillAnalysisResultSchema.parse(
      await llm.analyzeResume({ resumeText: RESUME, locale: 'en' }),
    );
    expect(ja.summary).toMatch(/年/);
    expect(en.summary).toMatch(/years/i);
  });
});

describe('createLlmProvider selection (unit)', () => {
  const base = { NODE_ENV: 'test', ARS_RUNTIME: 'local' } as NodeJS.ProcessEnv;

  it('selects OpenAI when AI_PROVIDER=openai and a key is present', () => {
    const llm = createLlmProvider(
      loadConfig({ ...base, AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' }),
    );
    expect(llm.providerName).toBe('openai');
    expect(llm.modelVersion).toBe('gpt-4o-mini'); // OPENAI_MODEL default
  });

  it('selects Anthropic when AI_PROVIDER=anthropic and a key is present', () => {
    const llm = createLlmProvider(
      loadConfig({ ...base, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }),
    );
    expect(llm.providerName).toBe('anthropic');
  });

  it('falls back to the mock when the configured provider has no key', () => {
    const llm = createLlmProvider(loadConfig({ ...base, AI_PROVIDER: 'openai' }));
    expect(llm.providerName).toBe('mock');
  });
});

describe('MockEmbeddingProvider.embed (unit)', () => {
  it('returns a deterministic, 384-length vector', async () => {
    const emb = new MockEmbeddingProvider();
    const v1 = await emb.embed('TypeScript React Node.js engineer');
    const v2 = await emb.embed('TypeScript React Node.js engineer');
    expect(v1).toHaveLength(384);
    expect(v1.every((n) => typeof n === 'number')).toBe(true);
    expect(v1).toEqual(v2);
  });

  it('scores similar texts higher than dissimilar ones', async () => {
    const emb = new MockEmbeddingProvider();
    const base = await emb.embed('TypeScript React frontend engineer with web UI experience');
    const similar = await emb.embed('Frontend engineer experienced in React and TypeScript web UI');
    const dissimilar = await emb.embed('Mechanical engineer designing HVAC pipes and turbines');
    expect(cosineSimilarity(base, similar)).toBeGreaterThan(cosineSimilarity(base, dissimilar));
  });
});

describe('runAnalysis retry/fallback (unit, FR-03.2)', () => {
  it('rejects after retries when the LLM never returns valid output', async () => {
    let calls = 0;
    const stubDeps = {
      llm: {
        providerName: 'stub',
        modelVersion: 'stub-v1',
        promptVersion: 'v1',
        async analyzeResume() {
          calls += 1;
          return {}; // always invalid against SkillAnalysisResultSchema
        },
      },
      log: { warn() {}, info() {}, error() {} },
    } as unknown as Parameters<typeof runAnalysis>[0];

    await expect(runAnalysis(stubDeps, 'some resume text', 'en')).rejects.toThrow();
    expect(calls).toBe(3); // MAX_ATTEMPTS
  });

  it('resolves with a valid object from the LLM', async () => {
    const valid = {
      summary: 'Experienced engineer with 5 years building software.',
      totalYearsExperience: 5,
      skills: [
        {
          name: 'TypeScript',
          category: 'Programming',
          proficiency: 'advanced',
          yearsExperience: 5,
          evidence: [],
        },
      ],
      strengths: ['TypeScript'],
      careerDirections: [],
      recommendedLearning: [],
      locale: 'en',
    };
    const stubDeps = {
      llm: {
        providerName: 'stub',
        modelVersion: 'stub-v1',
        promptVersion: 'v1',
        async analyzeResume() {
          return valid;
        },
      },
      log: { warn() {}, info() {}, error() {} },
    } as unknown as Parameters<typeof runAnalysis>[0];

    const result = await runAnalysis(stubDeps, 'text', 'en');
    expect(result.totalYearsExperience).toBe(5);
    expect(result.skills[0]!.name).toBe('TypeScript');
  });
});

describe('RealtimeBus pub/sub (unit, FR-08.2)', () => {
  it('delivers published events to a subscriber and stops after unsubscribe', () => {
    const bus = new RealtimeBus();
    const received: unknown[] = [];
    const unsubscribe = bus.subscribe('conversation:1', (e) => received.push(e.payload));

    bus.publish('conversation:1', { type: 'message', payload: { id: 'm1' } });
    expect(received).toEqual([{ id: 'm1' }]);

    // A different channel does not reach this subscriber.
    bus.publish('conversation:2', { type: 'message', payload: { id: 'other' } });
    expect(received).toHaveLength(1);

    unsubscribe();
    bus.publish('conversation:1', { type: 'message', payload: { id: 'm2' } });
    expect(received).toHaveLength(1);
  });
});
