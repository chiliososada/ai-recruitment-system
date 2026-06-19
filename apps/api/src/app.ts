import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '@ars/shared';
import { ZodError } from 'zod';
import type { Deps } from './deps.js';
import { AppError, validationError, zodToIssues } from './errors.js';
import { registerRoutes } from './routes/index.js';
import { APP_COMMIT, APP_VERSION, uptimeSeconds } from './version.js';

interface FastifyHttpError {
  statusCode?: number;
  code?: string;
  message?: string;
}

function errorBody(
  code: ApiErrorBody['error']['code'],
  message: string,
  messageKey: string,
  correlationId: string,
): ApiErrorBody {
  return { error: { code, message, messageKey, correlationId } };
}

export async function buildServer(deps: Deps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.log,
    requestIdHeader: 'x-correlation-id',
    requestIdLogLabel: 'correlationId',
    genReqId: () => randomUUID(),
    bodyLimit: 1024 * 1024,
    disableRequestLogging: deps.config.NODE_ENV === 'test',
  }) as unknown as FastifyInstance;

  // Strict security headers (SEC-1). The API serves JSON/SSE/text only, so a locked-down CSP is
  // safe; the SPA's CSP is applied at its static host / nginx (see docs/SECURITY.md, infra/nginx).
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
      },
    },
    // It's a CORS API consumed cross-origin by the SPA; CORS governs reads.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: deps.config.isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  });
  await app.register(cors, { origin: deps.config.corsOrigins, credentials: true });
  await app.register(rateLimit, {
    max: deps.config.rateLimitMax,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: deps.config.MAX_UPLOAD_BYTES, files: 1, fields: 10 },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'AI Recruitment System API', version: '0.1.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
  });

  // Echo the correlation id back on every response.
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-correlation-id', req.id);
  });

  // Request metrics: rate + status + latency, low-cardinality route label (§10).
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'unknown';
    deps.metrics.increment('http_requests_total', {
      method: req.method,
      status: reply.statusCode,
      route,
    });
    deps.metrics.observe('http_request_duration', reply.elapsedTime, { route });
  });

  // Resolve the bearer token to a principal (null when absent/invalid).
  app.decorateRequest('principal', null);
  app.addHook('onRequest', async (req) => {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
      try {
        const payload = deps.tokens.verify(header.slice(7));
        req.principal = {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          emailVerified: payload.emailVerified,
        };
      } catch {
        req.principal = null;
      }
    } else {
      req.principal = null;
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const correlationId = req.id;
    if (err instanceof AppError) {
      return reply.code(err.status).send(err.toBody(correlationId));
    }
    if (err instanceof ZodError) {
      const mapped = validationError(zodToIssues(err));
      return reply.code(mapped.status).send(mapped.toBody(correlationId));
    }
    const httpErr = err as FastifyHttpError;
    // Postgres RLS WITH CHECK violation (e.g. cross-tenant INSERT) → forbidden.
    if (httpErr.code === '42501') {
      return reply
        .code(403)
        .send(errorBody('FORBIDDEN', 'Forbidden', 'error.forbidden', correlationId));
    }
    if (httpErr.statusCode === 429) {
      return reply
        .code(429)
        .send(errorBody('RATE_LIMITED', 'Too many requests', 'error.rateLimited', correlationId));
    }
    if (httpErr.statusCode === 413 || httpErr.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply
        .code(413)
        .send(
          errorBody(
            'PAYLOAD_TOO_LARGE',
            'Payload too large',
            'resume.upload.tooLarge',
            correlationId,
          ),
        );
    }
    if (httpErr.statusCode === 400) {
      return reply
        .code(400)
        .send(
          errorBody(
            'BAD_REQUEST',
            httpErr.message ?? 'Bad request',
            'error.badRequest',
            correlationId,
          ),
        );
    }
    req.log.error({ err }, 'unhandled error');
    return reply
      .code(500)
      .send(errorBody('INTERNAL', 'Internal server error', 'error.internal', correlationId));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send(errorBody('NOT_FOUND', 'Route not found', 'error.notFound', req.id));
  });

  app.get('/health', async () => ({
    status: 'ok',
    runtime: deps.config.ARS_RUNTIME,
    version: APP_VERSION,
    commit: APP_COMMIT,
    uptime: uptimeSeconds(),
  }));

  // Readiness probes critical dependencies (DB) — never a static success (§7).
  app.get('/ready', async (_req, reply) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    try {
      await deps.db.service((c) => c.query('select 1 as ok'));
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }
    const ready = Object.values(checks).every((v) => v === 'ok');
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks });
  });

  // Prometheus-style metrics exposition (job queue depth + request/provider metrics).
  app.get('/metrics', async (_req, reply) => {
    try {
      const stats = await deps.jobs.stats();
      for (const [status, count] of Object.entries(stats)) {
        deps.metrics.gauge('job_queue_depth', count, { status });
      }
    } catch {
      /* metrics endpoint must not fail the scrape */
    }
    return reply.header('content-type', 'text/plain; version=0.0.4').send(deps.metrics.render());
  });

  app.get('/openapi.json', async () => app.swagger());

  await app.register(
    async (instance) => {
      await registerRoutes(instance, deps);
    },
    { prefix: '/api' },
  );

  return app;
}
