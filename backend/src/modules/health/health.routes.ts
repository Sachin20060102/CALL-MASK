import type { FastifyInstance } from 'fastify';
import type { AppPrismaClient } from '../../lib/prisma.js';
import type { RedisStore } from '../../lib/redis.js';
import { TelephonyService } from '../telephony/telephony.service.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    redis: RedisStore;
    telephonyService: TelephonyService;
  }
) {
  app.get('/api/v1/health', async () => {
    let dbUp = false;
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch {
      dbUp = false;
    }

    const redisUp = await deps.redis.ping();
    const telephony = deps.telephonyService.getRuntimeState();

    return {
      status: dbUp ? 'ok' : 'degraded',
      telephony: {
        enabled: telephony.enabled,
        mode: telephony.effectiveMode,
        complianceVerified: telephony.complianceVerified,
      },
      services: {
        database: dbUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
      timestamp: new Date().toISOString(),
    };
  });
}
