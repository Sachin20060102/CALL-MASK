import type { FastifyInstance } from 'fastify';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { CallsService } from '../calls/calls.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';

export function registerUsageRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    callsService: CallsService;
    telephonyService: TelephonyService;
    requireAuth: (req: never) => Promise<void>;
  }
) {
  app.get('/api/v1/usage/summary', { preHandler: deps.requireAuth as never }, async (request) => {
    const userId = request.authUser!.id;
    const policy = await deps.callsService.getEffectivePolicy(request.authUser!);
    const runtime = deps.telephonyService.getRuntimeState();

    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const calls = await deps.prisma.callRecord.findMany({
      where: { userId },
    });

    let completedCalls = 0;
    let failedCalls = 0;
    let canceledCalls = 0;
    let blockedCalls = 0;
    let activeCalls = 0;
    let totalDurationSeconds = 0;
    let todayCalls = 0;
    let monthCalls = 0;

    for (const c of calls) {
      if (c.status === 'COMPLETED') completedCalls += 1;
      else if (c.status === 'FAILED') failedCalls += 1;
      else if (c.status === 'CANCELED') canceledCalls += 1;
      else if (c.status === 'BLOCKED') blockedCalls += 1;
      else activeCalls += 1;

      totalDurationSeconds += c.durationSeconds;

      if (c.status !== 'BLOCKED') {
        if (c.startedAt >= startOfDay) todayCalls += 1;
        if (c.startedAt >= startOfMonth) monthCalls += 1;
      }
    }

    const totalCalls = calls.length;
    const finishedCount = completedCalls + canceledCalls;
    const averageDurationSeconds =
      finishedCount > 0 ? Math.round(totalDurationSeconds / finishedCount) : 0;

    return {
      totalCalls,
      completedCalls,
      failedCalls,
      canceledCalls,
      blockedCalls,
      activeCalls,
      totalDurationSeconds,
      averageDurationSeconds,
      todayCalls,
      dailyCallLimit: policy.dailyCallLimit,
      monthCalls,
      monthlyCallQuota: policy.monthlyCallQuota,
      maxCallDurationSeconds: policy.maxCallDurationSeconds,
      telephonyEnabled: runtime.enabled,
      telephonyMode: runtime.effectiveMode,
    };
  });
}
