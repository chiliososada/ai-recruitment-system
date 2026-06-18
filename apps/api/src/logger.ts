import { pino, type Logger } from 'pino';
import type { AppConfig } from './config.js';

/**
 * Central logger. Redacts known sensitive fields so logs never contain passwords,
 * tokens, full resumes or LLM prompts (FR-03.5, §8). The free-text message of a log
 * line should also be passed through `logPreview`/`redactForLog` from @ars/shared
 * before logging untrusted content.
 */
export function createLogger(config: AppConfig): Logger {
  return pino({
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'password',
        '*.password',
        'req.headers.authorization',
        'headers.authorization',
        'token',
        '*.token',
        'accessToken',
        '*.accessToken',
        'resumeText',
        '*.resumeText',
        'prompt',
        '*.prompt',
        'apiKey',
        '*.apiKey',
      ],
      censor: '[redacted]',
    },
    base: { service: 'ars-api' },
  });
}

export type { Logger };
