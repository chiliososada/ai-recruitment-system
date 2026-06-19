import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { buildDeps } from './deps.js';
import { APP_COMMIT, APP_VERSION } from './version.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = await buildDeps(config);
  const app = await buildServer(deps);

  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  deps.jobs.start(); // background worker (no-op in inline mode)
  deps.log.info(
    {
      runtime: config.ARS_RUNTIME,
      version: APP_VERSION,
      commit: APP_COMMIT,
      jobsInline: config.jobsInline,
    },
    `API listening on ${config.API_HOST}:${config.API_PORT}`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    deps.log.info({ signal }, 'graceful shutdown: draining');
    // Force-exit backstop if drain hangs.
    const timer = setTimeout(() => {
      deps.log.error('graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 15_000);
    timer.unref();
    try {
      await app.close(); // stop accepting new requests
      await deps.jobs.stop(); // drain in-flight jobs, stop the worker loop
      await deps.db.close();
      deps.log.info('graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      deps.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
