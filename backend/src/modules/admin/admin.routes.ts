import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppPrismaClient } from '../../lib/prisma.js';
import type { RedisStore } from '../../lib/redis.js';
import { recordAuditLog } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { isValidE164 } from '../calls/calls.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';

const updateUserSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  suspensionReason: z.string().max(191).nullable().optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
  maxCallDurationSeconds: z.number().int().positive().max(86400).nullable().optional(),
  dailyCallLimit: z.number().int().positive().max(10000).nullable().optional(),
  monthlyCallQuota: z.number().int().positive().max(500000).nullable().optional(),
});

const createCallerIdSchema = z.object({
  phoneNumber: z.string().min(5).max(32),
  label: z.string().min(2).max(120),
  providerId: z.string().min(1),
  userId: z.string().nullable().optional(),
  isGlobal: z.boolean().default(false),
  verificationStatus: z.enum(['VERIFIED', 'PENDING', 'REVOKED']).default('VERIFIED'),
});

const updateCallerIdSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  verificationStatus: z.enum(['VERIFIED', 'PENDING', 'REVOKED']).optional(),
  active: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  userId: z.string().nullable().optional(),
});

const createProviderSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  protocol: z.enum(['MOCK', 'SIP', 'VOIP_REST']),
  enabled: z.boolean().default(false),
  complianceVerified: z.boolean().default(false),
  sipDomain: z.string().max(191).nullable().optional(),
  endpointUrl: z.string().max(191).nullable().optional(),
});

const updateProviderSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  enabled: z.boolean().optional(),
  complianceVerified: z.boolean().optional(),
  sipDomain: z.string().max(191).nullable().optional(),
  endpointUrl: z.string().max(191).nullable().optional(),
  healthStatus: z.enum(['HEALTHY', 'DEGRADED', 'DISABLED']).optional(),
});

const createRestrictionSchema = z.object({
  pattern: z.string().min(2).max(32),
  matchType: z.enum(['PREFIX', 'COUNTRY_CODE', 'EXACT']).default('PREFIX'),
  action: z.enum(['BLOCK', 'ALLOW']).default('BLOCK'),
  reason: z.string().min(2).max(191),
  active: z.boolean().default(true),
});

const updateRestrictionSchema = z.object({
  pattern: z.string().min(2).max(32).optional(),
  matchType: z.enum(['PREFIX', 'COUNTRY_CODE', 'EXACT']).optional(),
  action: z.enum(['BLOCK', 'ALLOW']).optional(),
  reason: z.string().min(2).max(191).optional(),
  active: z.boolean().optional(),
});

const createAbuseReportSchema = z.object({
  targetUserId: z.string().nullable().optional(),
  callRecordId: z.string().nullable().optional(),
  category: z.enum([
    'SPAM',
    'SPOOFING_ATTEMPT',
    'HIGH_FREQUENCY',
    'RESTRICTED_DESTINATION',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  description: z.string().min(5).max(2000),
});

const updateAbuseReportSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']),
  resolutionNote: z.string().max(2000).nullable().optional(),
});

const updateSystemSettingsSchema = z.object({
  maxCallDurationSeconds: z.number().int().positive().max(86400).optional(),
  defaultDailyCallLimit: z.number().int().positive().max(10000).optional(),
  defaultMonthlyCallQuota: z.number().int().positive().max(500000).optional(),
  velocityWindowSeconds: z.number().int().positive().max(3600).optional(),
  velocityMaxCalls: z.number().int().positive().max(1000).optional(),
});

export function registerAdminRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    redis: RedisStore;
    telephonyService: TelephonyService;
    requireAdmin: (req: never) => Promise<void>;
  }
) {
  const guard = { preHandler: deps.requireAdmin as never };

  app.get('/api/v1/admin/overview', guard, async () => {
    const [totalUsers, activeUsers, suspendedUsers, calls, openAbuseReports, providers] =
      await Promise.all([
        deps.prisma.user.count(),
        deps.prisma.user.count({ where: { status: 'ACTIVE' } }),
        deps.prisma.user.count({ where: { status: 'SUSPENDED' } }),
        deps.prisma.callRecord.findMany(),
        deps.prisma.abuseReport.count({ where: { status: { in: ['OPEN', 'INVESTIGATING'] } } }),
        deps.prisma.telephonyProvider.findMany(),
      ]);

    const redisUp = await deps.redis.ping();
    let dbUp = false;
    try {
      await deps.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch {
      dbUp = false;
    }

    const completedCalls = calls.filter((c) => c.status === 'COMPLETED').length;
    const failedCalls = calls.filter((c) => c.status === 'FAILED').length;
    const blockedCalls = calls.filter((c) => c.status === 'BLOCKED').length;
    const totalDurationSeconds = calls.reduce((acc, c) => acc + c.durationSeconds, 0);

    return {
      systemHealth: {
        database: dbUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
        telephony: deps.telephonyService.getRuntimeState(),
        providersHealthy: providers.filter((p) => p.healthStatus === 'HEALTHY').length,
        providersTotal: providers.length,
      },
      metrics: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalCalls: calls.length,
        completedCalls,
        failedCalls,
        blockedCalls,
        totalDurationSeconds,
        averageDurationSeconds:
          completedCalls > 0 ? Math.round(totalDurationSeconds / completedCalls) : 0,
        openAbuseReports,
      },
    };
  });

  app.get('/api/v1/admin/users', guard, async () => {
    const users = await deps.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { callRecords: true } },
      },
    });
    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        suspensionReason: u.suspensionReason,
        maxCallDurationSeconds: u.maxCallDurationSeconds,
        dailyCallLimit: u.dailyCallLimit,
        monthlyCallQuota: u.monthlyCallQuota,
        totalCalls: u._count.callRecords,
        createdAt: u.createdAt,
      })),
    };
  });

  app.patch('/api/v1/admin/users/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateUserSchema.parse(request.body);
    const existing = await deps.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const updated = await deps.prisma.user.update({
      where: { id },
      data: body as never,
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: body.status === 'SUSPENDED' ? 'USER_SUSPENDED' : 'USER_UPDATED_BY_ADMIN',
      targetType: 'User',
      targetId: id,
      details: body,
      ipAddress: request.ip,
    });

    return {
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status,
        suspensionReason: updated.suspensionReason,
        maxCallDurationSeconds: updated.maxCallDurationSeconds,
        dailyCallLimit: updated.dailyCallLimit,
        monthlyCallQuota: updated.monthlyCallQuota,
      },
    };
  });

  app.get('/api/v1/admin/calls', guard, async (request) => {
    const q = request.query as { status?: string; limit?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 50)));
    const calls = await deps.prisma.callRecord.findMany({
      where: q.status ? ({ status: q.status } as never) : undefined,
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        provider: { select: { id: true, name: true, protocol: true } },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return { calls };
  });

  app.get('/api/v1/admin/analytics/usage', guard, async () => {
    const calls = await deps.prisma.callRecord.findMany({
      orderBy: { startedAt: 'desc' },
    });

    const statusCounts: Record<string, number> = {};
    const dailyMap = new Map<string, { date: string; calls: number; durationSeconds: number }>();

    let totalDurationSeconds = 0;
    let completedCount = 0;

    for (const c of calls) {
      statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
      totalDurationSeconds += c.durationSeconds;
      if (c.status === 'COMPLETED') completedCount += 1;

      const dayKey = c.startedAt.toISOString().slice(0, 10);
      const dayEntry = dailyMap.get(dayKey) ?? { date: dayKey, calls: 0, durationSeconds: 0 };
      dayEntry.calls += 1;
      dayEntry.durationSeconds += c.durationSeconds;
      dailyMap.set(dayKey, dayEntry);
    }

    return {
      totalCalls: calls.length,
      completedCalls: completedCount,
      failedCalls: statusCounts.FAILED ?? 0,
      blockedCalls: statusCounts.BLOCKED ?? 0,
      totalDurationSeconds,
      averageDurationSeconds:
        completedCount > 0 ? Math.round(totalDurationSeconds / completedCount) : 0,
      statusBreakdown: statusCounts,
      dailySeries: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

  // Platform-owner carrier usage & cost telemetry strictly separated from user accounts
  app.get('/api/v1/admin/analytics/provider-costs', guard, async () => {
    const [providers, calls] = await Promise.all([
      deps.prisma.telephonyProvider.findMany(),
      deps.prisma.callRecord.findMany(),
    ]);

    const providerReports = providers.map((provider) => {
      const providerCalls = calls.filter((c) => c.providerId === provider.id);
      const totalDurationSeconds = providerCalls.reduce((sum, c) => sum + c.durationSeconds, 0);
      const reportedCostMicros = providerCalls.reduce(
        (sum, c) => sum + (c.providerReportedCostMicros ?? 0),
        0
      );

      return {
        providerId: provider.id,
        providerName: provider.name,
        providerCode: provider.code,
        protocol: provider.protocol,
        totalCalls: providerCalls.length,
        completedCalls: providerCalls.filter((c) => c.status === 'COMPLETED').length,
        totalDurationSeconds,
        reportedCostMicros,
        reportedCostUsd: Number((reportedCostMicros / 1_000_000).toFixed(4)),
        currency: 'USD',
      };
    });

    return {
      scopeNote:
        'Platform-owner carrier telemetry only. Users have no accounts charged, balances, or payment obligations.',
      providers: providerReports,
    };
  });

  app.get('/api/v1/admin/caller-ids', guard, async () => {
    const callerIds = await deps.prisma.authorizedCallerId.findMany({
      include: {
        provider: { select: { id: true, name: true, code: true, protocol: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { callerIds };
  });

  app.post('/api/v1/admin/caller-ids', guard, async (request, reply) => {
    const body = createCallerIdSchema.parse(request.body);
    if (!isValidE164(body.phoneNumber.trim())) {
      throw new AppError(400, 'INVALID_PHONE_NUMBER', 'Caller ID must be in E.164 format');
    }

    const callerId = await deps.prisma.authorizedCallerId.create({
      data: {
        phoneNumber: body.phoneNumber.trim(),
        label: body.label.trim(),
        providerId: body.providerId,
        userId: body.userId ?? null,
        isGlobal: body.isGlobal,
        verificationStatus: body.verificationStatus,
        active: true,
      },
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'CALLER_ID_CREATED',
      targetType: 'AuthorizedCallerId',
      targetId: callerId.id,
      details: body,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ callerId });
  });

  app.patch('/api/v1/admin/caller-ids/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateCallerIdSchema.parse(request.body);
    const callerId = await deps.prisma.authorizedCallerId.update({
      where: { id },
      data: body as never,
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'CALLER_ID_UPDATED',
      targetType: 'AuthorizedCallerId',
      targetId: id,
      details: body,
      ipAddress: request.ip,
    });

    return { callerId };
  });

  app.delete('/api/v1/admin/caller-ids/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    await deps.prisma.authorizedCallerId.delete({ where: { id } });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'CALLER_ID_DELETED',
      targetType: 'AuthorizedCallerId',
      targetId: id,
      ipAddress: request.ip,
    });

    return { deleted: true };
  });

  app.get('/api/v1/admin/providers', guard, async () => {
    const providers = await deps.prisma.telephonyProvider.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return {
      runtime: deps.telephonyService.getRuntimeState(),
      providers,
    };
  });

  app.post('/api/v1/admin/providers', guard, async (request, reply) => {
    const body = createProviderSchema.parse(request.body);
    const provider = await deps.prisma.telephonyProvider.create({
      data: {
        name: body.name,
        code: body.code,
        protocol: body.protocol,
        enabled: body.enabled,
        complianceVerified: body.complianceVerified,
        sipDomain: body.sipDomain ?? null,
        endpointUrl: body.endpointUrl ?? null,
        healthStatus: body.enabled ? 'HEALTHY' : 'DISABLED',
      },
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'PROVIDER_CREATED',
      targetType: 'TelephonyProvider',
      targetId: provider.id,
      details: body,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ provider });
  });

  app.patch('/api/v1/admin/providers/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateProviderSchema.parse(request.body);
    const provider = await deps.prisma.telephonyProvider.update({
      where: { id },
      data: body as never,
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'PROVIDER_UPDATED',
      targetType: 'TelephonyProvider',
      targetId: id,
      details: body,
      ipAddress: request.ip,
    });

    return { provider };
  });

  app.post('/api/v1/admin/providers/:id/health-check', guard, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await deps.prisma.telephonyProvider.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'PROVIDER_NOT_FOUND', 'Telephony provider not found');
    }

    const nextHealth =
      existing.protocol === 'MOCK'
        ? 'HEALTHY'
        : existing.enabled && existing.complianceVerified
          ? 'HEALTHY'
          : 'DISABLED';

    const provider = await deps.prisma.telephonyProvider.update({
      where: { id },
      data: {
        healthStatus: nextHealth,
        lastHealthCheckAt: new Date(),
      },
    });

    return { provider };
  });

  app.get('/api/v1/admin/restrictions', guard, async () => {
    const restrictions = await deps.prisma.destinationRestriction.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { restrictions };
  });

  app.post('/api/v1/admin/restrictions', guard, async (request, reply) => {
    const body = createRestrictionSchema.parse(request.body);
    const restriction = await deps.prisma.destinationRestriction.create({
      data: body,
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'DESTINATION_RESTRICTION_CREATED',
      targetType: 'DestinationRestriction',
      targetId: restriction.id,
      details: body,
      ipAddress: request.ip,
    });

    return reply.status(201).send({ restriction });
  });

  app.patch('/api/v1/admin/restrictions/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateRestrictionSchema.parse(request.body);
    const restriction = await deps.prisma.destinationRestriction.update({
      where: { id },
      data: body as never,
    });
    return { restriction };
  });

  app.delete('/api/v1/admin/restrictions/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    await deps.prisma.destinationRestriction.delete({ where: { id } });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'DESTINATION_RESTRICTION_DELETED',
      targetType: 'DestinationRestriction',
      targetId: id,
      ipAddress: request.ip,
    });

    return { deleted: true };
  });

  app.get('/api/v1/admin/abuse-reports', guard, async () => {
    const reports = await deps.prisma.abuseReport.findMany({
      include: {
        targetUser: { select: { id: true, email: true, fullName: true } },
        reportedByUser: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { reports };
  });

  app.post('/api/v1/admin/abuse-reports', guard, async (request, reply) => {
    const body = createAbuseReportSchema.parse(request.body);
    const report = await deps.prisma.abuseReport.create({
      data: {
        reportedByUserId: request.authUser!.id,
        targetUserId: body.targetUserId ?? null,
        callRecordId: body.callRecordId ?? null,
        category: body.category,
        severity: body.severity,
        description: body.description,
        status: 'OPEN',
      },
    });
    return reply.status(201).send({ report });
  });

  app.patch('/api/v1/admin/abuse-reports/:id', guard, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateAbuseReportSchema.parse(request.body);
    const report = await deps.prisma.abuseReport.update({
      where: { id },
      data: {
        status: body.status,
        resolutionNote: body.resolutionNote ?? null,
        resolvedByAdminId:
          body.status === 'RESOLVED' || body.status === 'DISMISSED'
            ? request.authUser!.id
            : null,
      },
    });

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'ABUSE_REPORT_UPDATED',
      targetType: 'AbuseReport',
      targetId: id,
      details: body,
      ipAddress: request.ip,
    });

    return { report };
  });

  app.get('/api/v1/admin/settings', guard, async () => {
    const settings = await deps.prisma.systemSetting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.valueJson;
    }
    return { settings: result };
  });

  app.patch('/api/v1/admin/settings', guard, async (request) => {
    const body = updateSystemSettingsSchema.parse(request.body);
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      await deps.prisma.systemSetting.upsert({
        where: { key },
        update: {
          valueJson: value as never,
          updatedByAdminId: request.authUser!.id,
        },
        create: {
          key,
          valueJson: value as never,
          updatedByAdminId: request.authUser!.id,
        },
      });
    }

    await recordAuditLog(deps.prisma, {
      actorUserId: request.authUser!.id,
      action: 'SYSTEM_SETTINGS_UPDATED',
      targetType: 'SystemSetting',
      details: body,
      ipAddress: request.ip,
    });

    const settings = await deps.prisma.systemSetting.findMany();
    const result: Record<string, unknown> = {};
    for (const s of settings) {
      result[s.key] = s.valueJson;
    }
    return { settings: result };
  });

  app.get('/api/v1/admin/audit-logs', guard, async (request) => {
    const q = request.query as { limit?: string };
    const limit = Math.min(200, Math.max(1, Number(q.limit ?? 100)));
    const logs = await deps.prisma.auditLog.findMany({
      include: {
        actorUser: { select: { id: true, email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return { logs };
  });
}
