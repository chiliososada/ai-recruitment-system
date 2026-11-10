import type { Notification } from '@ars/shared';
import type { TFunction } from 'i18next';

type T = TFunction;

function isJa(lang: string): boolean {
  return lang.startsWith('ja');
}

function isZh(lang: string): boolean {
  return lang.startsWith('zh');
}

/**
 * Human money amount. Japanese/Chinese yen amounts read in 万 (e.g. 6,000,000 → 600万円),
 * which is how salaries are written in Japan; other locales use Intl currency format.
 */
export function formatMoney(
  amount: number,
  currency: string | null | undefined,
  lang: string,
): string {
  const cur = (currency ?? 'JPY').toUpperCase();
  if (cur === 'JPY' && (isJa(lang) || isZh(lang))) {
    const unit = isJa(lang) ? '円' : isZh(lang) && lang.includes('TW') ? '日圓' : '日元';
    if (amount >= 10_000 && amount % 10_000 === 0) {
      return `${(amount / 10_000).toLocaleString('ja-JP')}万${unit}`;
    }
    return `${amount.toLocaleString('ja-JP')}${unit}`;
  }
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${cur}`;
  }
}

/** 「年収 600万円〜1,100万円」 style salary range; null when neither bound is set. */
export function formatSalaryRange(
  t: T,
  lang: string,
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return t('job.salaryRange', {
      min: formatMoney(min, currency, lang),
      max: formatMoney(max, currency, lang),
    });
  }
  if (min != null) return t('job.salaryFrom', { min: formatMoney(min, currency, lang) });
  return t('job.salaryUpTo', { max: formatMoney(max!, currency, lang) });
}

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric' }).format(
    d,
  );
}

export function formatDateTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(lang, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Canonical casing for common tech names (match results store skills lower-cased). */
const SKILL_CASE: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  'next.js': 'Next.js',
  'vue.js': 'Vue.js',
  vue: 'Vue',
  react: 'React',
  'react native': 'React Native',
  angular: 'Angular',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  sql: 'SQL',
  graphql: 'GraphQL',
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform',
  'ci/cd': 'CI/CD',
  css: 'CSS',
  html: 'HTML',
  go: 'Go',
  golang: 'Go',
  python: 'Python',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  php: 'PHP',
  ruby: 'Ruby',
  rust: 'Rust',
  'c#': 'C#',
  'c++': 'C++',
  '.net': '.NET',
  linux: 'Linux',
  git: 'Git',
  vite: 'Vite',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  'machine learning': 'Machine Learning',
  flutter: 'Flutter',
  spark: 'Spark',
  airflow: 'Airflow',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  'system design': 'System Design',
};

/**
 * Display form of a skill name. Prefers the casing used in `known` (e.g. the job's own skill
 * list), then a dictionary of common technologies; otherwise capitalises a lower-case word.
 */
export function prettySkill(name: string, known: readonly string[] = []): string {
  const key = name.trim().toLowerCase();
  const hit = known.find((k) => k.trim().toLowerCase() === key);
  if (hit) return hit;
  if (SKILL_CASE[key]) return SKILL_CASE[key];
  if (/^[a-z][a-z0-9.+#-]*$/.test(name.trim())) {
    return name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
  }
  return name;
}

/**
 * Localised one-line body for a notification. The API stores machine values (a stage,
 * an interview mode or response) for some types; render those through the dictionary.
 */
export function notificationBody(t: T, n: Notification): string | null {
  const data = (n.data ?? {}) as Record<string, unknown>;
  if (n.type === 'application_status_changed') {
    const stage =
      (typeof data.stage === 'string' && data.stage) ||
      (n.body ? /Stage:\s*([a-z_]+)/.exec(n.body)?.[1] : undefined);
    if (stage) {
      return t('notification.stageChanged', {
        stage: t(`application.stage.${stage}`, { defaultValue: stage }),
      });
    }
  }
  if (n.type === 'interview_proposed' && n.body) {
    return t('notification.interviewProposedBody', {
      mode: t(`interview.modeValue.${n.body}`, { defaultValue: n.body }),
    });
  }
  if (n.type === 'interview_updated' && n.body) {
    return t('notification.interviewUpdatedBody', {
      status: t(`interview.status.${n.body}`, { defaultValue: n.body }),
    });
  }
  return n.body;
}

/** Older notifications deep-link to routes the SPA never had; map them to real pages. */
export function notificationLink(link: string | null): string | null {
  if (!link) return null;
  const jobApps = /^\/console\/jobs\/([^/?#]+)\/applications\/?$/.exec(link);
  if (jobApps) return `/console/jobs/${jobApps[1]}`;
  const conv = /^\/messages\/([^/?#]+)\/?$/.exec(link);
  if (conv) return `/messages?c=${conv[1]}`;
  return link;
}
