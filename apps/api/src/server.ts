import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { buildDeps } from './deps.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const deps = await buildDeps(config);
  const app = await buildServer(deps);
  await app.listen({ port: config.API_PORT, host: config.API_HOST });
  deps.log.info(`API listening on ${config.API_HOST}:${config.API_PORT} (runtime=${config.ARS_RUNTIME})`);
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
