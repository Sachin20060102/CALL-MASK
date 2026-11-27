import type { FastifyInstance } from 'fastify';
import type { AppEnv } from '../../config/env.js';
import type { AppPrismaClient } from '../../lib/prisma.js';

export function registerCallerIdRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    env: AppEnv;
    requireAuth: (req: never) => Promise<void>;
  }
) {
  app.get('/api/v1/caller-ids', { preHandler: deps.requireAuth as never }, async (request) => {
    const callerIds = await deps.prisma.authorizedCallerId.findMany({
      where: {
        active: true,
        verificationStatus: 'VERIFIED',
        OR: [{ userId: request.authUser!.id }, { isGlobal: true }],
      },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            code: true,
            protocol: true,
            enabled: true,
          },
        },
      },
      orderBy: [{ isGlobal: 'desc' }, { createdAt: 'asc' }],
    });

    const liveMode =
      deps.env.TELEPHONY_ENABLED &&
      deps.env.TELEPHONY_MODE === 'live' &&
      deps.env.TELEPHONY_COMPLIANCE_VERIFIED;

    const sorted = [...callerIds].sort((a, b) => {
      if (liveMode) {
        const aLive = a.provider.protocol !== 'MOCK' ? 1 : 0;
        const bLive = b.provider.protocol !== 'MOCK' ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
      }
      return 0;
    });

    const userDefault = sorted.find((c) => c.id === request.authUser!.defaultCallerIdId);
    const shouldOverrideMockDefault =
      liveMode && (!userDefault || userDefault.provider.protocol === 'MOCK');
    const firstLive = sorted.find((c) => c.provider.protocol !== 'MOCK');

    return {
      callerIds: sorted.map((cid) => ({
        id: cid.id,
        phoneNumber: cid.phoneNumber,
        label: cid.label,
        verificationStatus: cid.verificationStatus,
        isGlobal: cid.isGlobal,
        isDefault: shouldOverrideMockDefault && firstLive
          ? cid.id === firstLive.id
          : cid.id === request.authUser!.defaultCallerIdId,
        provider: cid.provider,
      })),
    };
  });
}
