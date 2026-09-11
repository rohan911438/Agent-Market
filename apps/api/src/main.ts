import { buildContext } from './build-context.js';
import { initTracing } from './observability/tracing.js';
import { startSyntheticMonitor } from './observability/synthetic-scheduler.js';
import { buildServer } from './server.js';

// Load apps/api/.env into process.env if present (Node's built-in loader —
// no dotenv dependency needed). Production deployments inject env vars
// directly via the platform, so a missing .env here is expected and fine.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — rely on process.env as provided by the platform
}

// Must run before any request is handled — see tracing.ts. Deliberately not
// called from build-context.ts/buildServer, so tests (which build a server
// directly, never going through main.ts) never register a real exporter or
// start a background scheduler.
initTracing();

async function main(): Promise<void> {
  const ctx = buildContext();
  const server = buildServer(ctx);
  const stopSyntheticMonitor = startSyntheticMonitor(ctx);

  try {
    await server.listen({ port: ctx.config.server.port, host: ctx.config.server.host });
    server.log.info(
      `AgentMarket API listening on ${ctx.config.server.host}:${ctx.config.server.port} (payment provider: ${ctx.config.payments.provider}, cache: ${ctx.config.cache.driver})`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }

  const shutdown = async (): Promise<void> => {
    server.log.info('Shutting down...');
    stopSyntheticMonitor();
    await server.close();
    await ctx.db.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main();
