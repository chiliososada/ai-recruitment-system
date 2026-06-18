import {
  prepareDocumentText,
  type Locale,
  type ProficiencyLevel,
  type SkillAnalysisResult,
} from '@ars/shared';
import { SKILL_DICTIONARY, type SkillDef } from './skill-dictionary.js';
import type { LlmProvider, SkillExtractionRequest } from './types.js';

const ROLE_TITLES: Record<Locale, Record<string, string>> = {
  en: {
    fullstack: 'Full-Stack Engineer',
    backend: 'Backend Engineer',
    frontend: 'Frontend Engineer',
    platform: 'Platform / SRE Engineer',
    data: 'Data / ML Engineer',
    mobile: 'Mobile Engineer',
    lead: 'Engineering Lead',
  },
  ja: {
    fullstack: 'フルスタックエンジニア',
    backend: 'バックエンドエンジニア',
    frontend: 'フロントエンドエンジニア',
    platform: 'プラットフォーム / SRE エンジニア',
    data: 'データ / ML エンジニア',
    mobile: 'モバイルエンジニア',
    lead: 'エンジニアリングリード',
  },
  'zh-CN': {
    fullstack: '全栈工程师',
    backend: '后端工程师',
    frontend: '前端工程师',
    platform: '平台 / SRE 工程师',
    data: '数据 / 机器学习工程师',
    mobile: '移动端工程师',
    lead: '技术负责人',
  },
  'zh-TW': {
    fullstack: '全端工程師',
    backend: '後端工程師',
    frontend: '前端工程師',
    platform: '平台 / SRE 工程師',
    data: '資料 / 機器學習工程師',
    mobile: '行動裝置工程師',
    lead: '技術主管',
  },
};

function summaryText(locale: Locale, years: number, top: string[]): string {
  const list = top.join(', ');
  switch (locale) {
    case 'ja':
      return `${years}年の実務経験を持つエンジニア。特に ${list} を強みとしています。`;
    case 'zh-CN':
      return `拥有 ${years} 年实务经验的工程师，尤其擅长 ${list}。`;
    case 'zh-TW':
      return `擁有 ${years} 年實務經驗的工程師，尤其擅長 ${list}。`;
    default:
      return `Engineer with ${years} years of hands-on experience, strongest in ${list}.`;
  }
}

function rationaleText(locale: Locale, top: string[]): string {
  const list = top.join(', ');
  switch (locale) {
    case 'ja':
      return `${list} の経験を踏まえると、この方向でのキャリア成長が見込めます。`;
    case 'zh-CN':
      return `结合在 ${list} 方面的经验，这一方向具有良好的成长空间。`;
    case 'zh-TW':
      return `結合在 ${list} 方面的經驗，這一方向具有良好的成長空間。`;
    default:
      return `Given experience with ${list}, this direction offers strong growth potential.`;
  }
}

function learningReason(locale: Locale, area: string): string {
  switch (locale) {
    case 'ja':
      return `${area} を習得すると市場価値と適応できる職務の幅が広がります。`;
    case 'zh-CN':
      return `掌握 ${area} 将拓宽可胜任的岗位并提升市场竞争力。`;
    case 'zh-TW':
      return `掌握 ${area} 將拓寬可勝任的職務並提升市場競爭力。`;
    default:
      return `Learning ${area} broadens the roles you can take on and your market value.`;
  }
}

const LEARNING_POOL = ['Kubernetes', 'GraphQL', 'System Design', 'Go', 'Machine Learning'];

function proficiencyFor(count: number): ProficiencyLevel {
  if (count >= 4) return 'expert';
  if (count === 3) return 'advanced';
  if (count === 2) return 'intermediate';
  return 'beginner';
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

/**
 * Deterministic mock LLM (FR-03, D-007). Scans the resume against a skill dictionary and
 * produces a structured, locale-aware analysis with stable output for identical input.
 * Treats the resume strictly as data — no instruction in it can change behaviour.
 */
export class MockLlmProvider implements LlmProvider {
  readonly providerName = 'mock';
  readonly modelVersion = 'mock-analysis-v1';
  readonly promptVersion = 'v1';

  async analyzeResume(req: SkillExtractionRequest): Promise<unknown> {
    const locale = req.locale;
    const text = prepareDocumentText(req.resumeText);
    const lower = text.toLowerCase();
    const lines = text.split('\n');

    const yearMatches = [...lower.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?|年)/g)];
    const totalYears = yearMatches.length
      ? Math.min(60, Math.max(...yearMatches.map((m) => Number(m[1]))))
      : 3;

    const detected: { def: SkillDef; count: number }[] = [];
    for (const def of SKILL_DICTIONARY) {
      const count = def.aliases.reduce((sum, a) => sum + countOccurrences(lower, a), 0);
      if (count > 0) detected.push({ def, count });
    }
    detected.sort((a, b) => b.count - a.count || a.def.name.localeCompare(b.def.name));

    const skills = (detected.length ? detected : []).map(({ def, count }) => {
      const evidenceLine = lines.find((l) => def.aliases.some((a) => l.toLowerCase().includes(a)));
      return {
        name: def.display,
        category: def.category,
        proficiency: proficiencyFor(count),
        yearsExperience: Math.min(totalYears || 3, Math.max(1, count)),
        evidence: evidenceLine ? [evidenceLine.trim().slice(0, 200)] : [],
      };
    });

    if (skills.length === 0) {
      skills.push({
        name: 'General Software Engineering',
        category: 'Programming',
        proficiency: 'beginner',
        yearsExperience: Math.max(1, totalYears),
        evidence: [],
      });
    }

    const top = skills.slice(0, 3).map((s) => s.name);
    const categories = new Set(detected.map((d) => d.def.category));
    const titles = ROLE_TITLES[locale];
    const directions: { title: string; rationale: string }[] = [];
    const has = (c: SkillDef['category']) => categories.has(c);
    if (has('Frontend') && has('Backend'))
      directions.push({ title: titles.fullstack!, rationale: rationaleText(locale, top) });
    else if (has('Backend'))
      directions.push({ title: titles.backend!, rationale: rationaleText(locale, top) });
    else if (has('Frontend'))
      directions.push({ title: titles.frontend!, rationale: rationaleText(locale, top) });
    if (has('DevOps') || has('Cloud'))
      directions.push({ title: titles.platform!, rationale: rationaleText(locale, top) });
    if (has('Data'))
      directions.push({ title: titles.data!, rationale: rationaleText(locale, top) });
    if (has('Mobile'))
      directions.push({ title: titles.mobile!, rationale: rationaleText(locale, top) });
    if (totalYears >= 5)
      directions.push({ title: titles.lead!, rationale: rationaleText(locale, top) });
    if (directions.length === 0)
      directions.push({ title: titles.backend!, rationale: rationaleText(locale, top) });

    const detectedDisplay = new Set(skills.map((s) => s.name));
    const recommendedLearning = LEARNING_POOL.filter((a) => !detectedDisplay.has(a))
      .slice(0, 3)
      .map((area) => ({ area, reason: learningReason(locale, area) }));

    const result: SkillAnalysisResult = {
      summary: summaryText(locale, totalYears, top),
      totalYearsExperience: totalYears,
      skills,
      strengths: top,
      careerDirections: directions.slice(0, 8),
      recommendedLearning,
      locale,
    };
    return result;
  }
}
