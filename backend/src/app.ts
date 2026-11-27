import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { loadEnv, type AppEnv } from './config/env.js';
import { parseAllowedOrigins } from './lib/cors.js';
import { isAppError } from './lib/errors.js';
import { createPrismaClient, type AppPrismaClient } from './lib/prisma.js';
import { IoRedisStore, type RedisStore } from './lib/redis.js';
import { createAuthGuards } from './plugins/authGuard.js';
import { registerAccountRoutes } from './modules/account/account.routes.js';
import { registerAdminRoutes } from './modules/admin/admin.routes.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerCallerIdRoutes } from './modules/callerIds/callerIds.routes.js';
import { CallEventsHub } from './modules/calls/callEvents.hub.js';
import { registerCallRoutes } from './modules/calls/calls.routes.js';
import { CallsService } from './modules/calls/calls.service.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { TelephonyService } from './modules/telephony/telephony.service.js';
import type { MockTelephonyOptions } from './modules/telephony/mockTelephony.adapter.js';
import { registerUsageRoutes } from './modules/usage/usage.routes.js';

export interface BuildAppOptions {
  env?: AppEnv;
  prisma?: AppPrismaClient;
  redis?: RedisStore;
  mockTelephonyOptions?: MockTelephonyOptions;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();
  const prisma = options.prisma ?? createPrismaClient();
  const redis = options.redis ?? new IoRedisStore(env.REDIS_URL);
  const ownsPrisma = !options.prisma;
  const ownsRedis = !options.redis;

  const app = Fastify({
    logger: options.logger ?? false,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.trim() === '*' ? true : parseAllowedOrigins(env.CORS_ORIGIN),
    credentials: true,
  });

  const telephonyService = new TelephonyService(env, options.mockTelephonyOptions);
  const eventsHub = new CallEventsHub();
  const callsService = new CallsService(prisma, redis, env, telephonyService, eventsHub);
  const { requireAuth, requireAdmin } = createAuthGuards(prisma, env);

  app.setErrorHandler((error, _request, reply) => {
    if (isAppError(error)) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload or query parameters',
          details: error.issues,
        },
      });
    }
    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });
  });

  registerHealthRoutes(app, { prisma, redis, telephonyService });
  registerAuthRoutes(app, { prisma, redis, env });
  registerAccountRoutes(app, { prisma, callsService, requireAuth: requireAuth as never });
  registerCallerIdRoutes(app, { prisma, requireAuth: requireAuth as never });
  registerCallRoutes(app, {
    prisma,
    env,
    callsService,
    telephonyService,
    eventsHub,
    requireAuth: requireAuth as never,
  });
  registerUsageRoutes(app, {
    prisma,
    callsService,
    telephonyService,
    requireAuth: requireAuth as never,
  });
  registerAdminRoutes(app, {
    prisma,
    redis,
    telephonyService,
    requireAdmin: requireAdmin as never,
  });

  app.addHook('onClose', async () => {
    await telephonyService.shutdown();
    if (ownsRedis) {
      await redis.disconnect();
    }
    if (ownsPrisma) {
      await prisma.$disconnect();
    }
  });

  return app;
}
