# AI: Analysis, Embeddings & Matching

This system uses AI for two things: (1) extracting a **structured skill analysis** from a résumé and
(2) producing **embeddings** for vector recall during matching. The fit **score** itself is computed
by a deterministic, versioned rule-based function — the LLM is never the sole, unverifiable scorer.

Every AI dependency is behind a **provider interface** whose production implementation and
deterministic mock share the same contract, so the entire pipeline runs and is tested locally with
no API keys.

---

## Provider interfaces

Defined in `apps/api/src/adapters/ai/types.ts`:

```ts
interface LlmProvider {
  readonly providerName: string;   // 'mock' | 'anthropic'
  readonly modelVersion: string;
  readonly promptVersion: string;
  analyzeResume(req: { resumeText: string; locale: Locale }): Promise<unknown>; // RAW JSON
}

interface EmbeddingProvider {
  readonly providerName: string;   // 'mock' | 'openai'
  readonly model: string;
  readonly dimensions: number;     // 384
  embed(text: string): Promise<number[]>;
}
```

`analyzeResume` returns **raw, unvalidated** JSON on purpose — the service validates it (below), so
a malformed or prompt-injected model response can never corrupt persisted data.

### Selection (`apps/api/src/adapters/ai/index.ts`)

| Env | Mock (default) | Real provider |
| --- | -------------- | ------------- |
| `AI_PROVIDER` | `mock` — deterministic, locale-aware analysis from a skill dictionary | `anthropic` — Anthropic Messages API (requires `ANTHROPIC_API_KEY`; model `ANTHROPIC_MODEL`) |
| `EMBEDDING_PROVIDER` | `mock` — deterministic hashed bag-of-words, 384-dim | `openai` — OpenAI embeddings (requires `OPENAI_API_KEY`; model `OPENAI_EMBEDDING_MODEL`) |

If a real provider is selected but its API key is missing, the factory falls back to the mock.

### Mock LLM (`mock-llm.ts`)

Scans the résumé text against a skill dictionary and emits a structured, **locale-aware**
(`ja`/`en`/`zh-CN`/`zh-TW`) analysis — skills with proficiency/years/evidence, a summary, strengths,
career directions, and recommended learning. Identical input → identical output. It treats the
résumé strictly as data; no instruction inside it can change behavior.

### Real LLM (`anthropic-llm.ts`)

Calls `POST https://api.anthropic.com/v1/messages` with a system prompt that defines the task and
the exact JSON schema, and a user message that embeds the résumé **only inside delimiters** (see
defenses). The first JSON object in the response is parsed and returned raw for validation.

---

## Structured skill-analysis output

The LLM must return JSON matching `SkillAnalysisResultSchema`
(`packages/shared/src/schemas/analysis.ts`). Shape (with bounds):

```ts
SkillAnalysisResult {
  summary: string                       // 1–2000 chars
  totalYearsExperience: number          // 0–60
  skills: AnalyzedSkill[]               // 1–60 items
  strengths: string[]                   // ≤12
  careerDirections: { title; rationale }[]      // ≤8
  recommendedLearning: { area; reason }[]       // ≤12
  locale: 'ja' | 'en' | 'zh-CN' | 'zh-TW'
}

AnalyzedSkill {
  name: string                          // 1–80
  category: string | null
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  yearsExperience: number               // 0–60
  evidence: string[]                    // ≤8 items, each ≤400 chars
}
```

The bounded sizes also cap the blast radius of any prompt-injected résumé content.

### Validation, retry & fallback

In `apps/api/src/services/analysis.ts`, `runAnalysis()`:

1. Calls the provider, then validates the raw output with `SkillAnalysisResultSchema.safeParse`.
2. On a thrown error (timeout/HTTP failure/non-JSON) **or** a schema mismatch, it logs a warning
   (provider name + attempt number only — never the résumé text) and retries.
3. Up to **3 attempts**; if all fail it throws `UPSTREAM_AI_ERROR` (HTTP 502), which the SPA surfaces
   with a retry affordance.

On success the validated result is persisted to `skill_analyses` with traceable metadata
(`model_provider`, `model_version`, `prompt_version`, `generated_at`, `locale`), the candidate's
skills and `years_experience` are updated, and the candidate embedding is regenerated.

---

## Embeddings

- **Dimensions:** 384, matching the `vector(384)` columns and `EMBEDDING_DIMENSIONS`.
- **Mock (`embedding.ts`):** a deterministic, L2-normalized hashed bag-of-words — tokens are hashed
  into vector slots so documents that share terms get higher cosine similarity. No external calls;
  identical text → identical vector, which makes vector recall reproducible in tests.
- **Real (OpenAI):** requests the configured model with `dimensions: 384` so output fits the column.
- Candidate and job embeddings live in `candidate_embeddings` / `job_embeddings`, each indexed with
  `ivfflat (… vector_cosine_ops)` and tagged with the algorithm version and a `source_hash`. They
  are **regenerated** when the source changes — résumé analysis re-runs, or job content is edited —
  so matches never go stale.

---

## Scoring formula

The match score is computed by the pure function `scoreMatch()` in
`packages/shared/src/scoring.ts`. Pipeline:

1. **Vector recall (SQL):** `pgvector` cosine similarity over the `ivfflat` index returns the
   nearest candidates/jobs (`1 - (a <=> b)`), probing all index lists for exact recall at MVP sizes.
2. **Explainable rule scores:** the candidate/job pair is scored on six dimensions in `[0, 1]`:
   vector similarity, skill coverage (proficiency-weighted required + preferred), experience fit,
   salary fit, location/work-style fit, and language coverage.
3. **Weighted combination, normalized to an integer 0–100:**

| Dimension | Weight |
| --------- | ------ |
| Vector similarity | 0.30 |
| Skill match | 0.35 |
| Experience | 0.15 |
| Salary | 0.08 |
| Location | 0.07 |
| Language | 0.05 |

The function is pure and deterministic: identical inputs always yield the identical score, with
stable boundaries (clamped to `[0, 100]`). The result also carries the per-dimension `breakdown`,
`matchedSkills`, and `missingSkills`, which feed the human-readable reason shown in the UI.

### Algorithm version

`ALGORITHM_VERSION = 'match-v1'` is exported from `@ars/shared`, seeded into the
`algorithm_versions` table (with these exact weights), and stored on every `match_results` row.
Bump it when weights or logic change so old and new scores remain distinguishable and reproducible.

### LLM's bounded role

An LLM may re-order and write short reasons for the top-K results within constrained bounds, but it
**never replaces** `scoreMatch()`. The stored numeric score always comes from the deterministic
function (FR-05.2), and matching has tests for score boundaries, ordering, the no-candidates case,
and vector/LLM failure.

---

## Prompt-injection defenses

Résumé and job text are **untrusted input**. The strategy (`packages/shared/src/prompt-safety.ts`)
is not to "detect" injection (brittle) but to contain it:

1. **Normalize & cap** — `prepareDocumentText()` strips control bytes, collapses whitespace, and
   truncates to `MAX_RESUME_CHARS` (20,000).
2. **Wrap as data, not instructions** — `wrapUntrustedDocument()` places the text between
   `<<<UNTRUSTED_DOCUMENT>>>` / `<<<END_UNTRUSTED_DOCUMENT>>>` markers and neutralizes any attempt to
   close the block early. The system prompt explicitly states the wrapped content is DATA: the model
   must never follow instructions inside it, never reveal the prompt, and never call tools.
3. **Schema-validate the output** — the model's response must pass `SkillAnalysisResultSchema`
   (bounded sizes), else it is rejected and retried (above). Injected text cannot produce a
   structurally invalid or oversized record.
4. **Redaction before logging** — `redactForLog()` / `logPreview()` mask emails and long
   token-like strings, so previews that reach logs never contain raw PII or secrets.

---

## Privacy boundaries

- **Logs never contain résumé text, full prompts, secrets, or PII.** AI failures log only the
  provider name and attempt count; any text preview goes through redaction first.
- **Résumé storage is private and authorization-gated.** Files are stored at unguessable,
  server-generated paths. `GET /api/resumes/:id/download` is allowed only to the owner, or to a
  company member who already has the candidate via an application or shortlist — enforced in the
  service and by Storage RLS policies (see [DATABASE.md](DATABASE.md)).
- **Persisted analysis metadata is traceable but minimal** — provider, model version, prompt
  version, generation time, and locale — never the raw model conversation.

---

## Configuration recap

| Variable | Purpose | Default |
| -------- | ------- | ------- |
| `AI_PROVIDER` | `mock` / `anthropic` / `openai` | `mock` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Anthropic credentials / model | — / `claude-opus-4-8` |
| `EMBEDDING_PROVIDER` | `mock` / `openai` | `mock` |
| `EMBEDDING_DIMENSIONS` | Vector size (matches `vector(384)`) | `384` |
| `OPENAI_API_KEY` / `OPENAI_EMBEDDING_MODEL` | OpenAI credentials / model | — / `text-embedding-3-small` |
