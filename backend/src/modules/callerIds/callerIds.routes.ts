import type { FastifyInstance } from 'fastify';
import type { AppPrismaClient } from '../../lib/prisma.js';

export function registerCallerIdRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
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

    return {
      callerIds: callerIds.map((cid) => ({
        id: cid.id,
        phoneNumber: cid.phoneNumber,
        label: cid.label,
        verificationStatus: cid.verificationStatus,
        isGlobal: cid.isGlobal,
        isDefault: cid.id === request.authUser!.defaultCallerIdId,
        provider: cid.provider,
      })),
    };
  });
}
