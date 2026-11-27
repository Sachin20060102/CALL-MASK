import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './config/env.js';
import { ensureOperationalBootstrap } from './lib/bootstrap.js';
import { createPrismaClient } from './lib/prisma.js';
import { buildApp } from './app.js';

function loadLocalEnvFiles() {
  if (typeof process.loadEnvFile !== 'function') return;
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
}

async function start() {
  loadLocalEnvFiles();
  const env = loadEnv();
  const prisma = createPrismaClient();

  try {
    await ensureOperationalBootstrap(prisma);
  } catch (error) {
    console.warn('Operational bootstrap skipped or failed:', error);
  }

  const app = await buildApp({
    env,
    prisma,
    logger: env.NODE_ENV !== 'test',
  });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, closing MocoCall API server...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({
    port: env.PORT,
    host: env.HOST,
  });
}

start().catch((error) => {
  console.error('Failed to start MocoCall API server:', error);
  process.exit(1);
});
