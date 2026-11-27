import type { AppEnv } from '../../config/env.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import type { RedisStore } from '../../lib/redis.js';
import type { AuthenticatedUser } from '../../plugins/authGuard.js';
import { AppError } from '../../lib/errors.js';
import { recordAuditLog } from '../../lib/audit.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import type { CallTransitionStatus } from '../telephony/telephony.types.js';
import { CallEventsHub } from './callEvents.hub.js';

export interface EffectiveOperationalPolicy {
  maxCallDurationSeconds: number;
  dailyCallLimit: number;
  monthlyCallQuota: number;
  velocityWindowSeconds: number;
  velocityMaxCalls: number;
}

export function isValidE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phoneNumber);
}

export function evaluateDestinationRules(
  destinationNumber: string,
  rules: Array<{
    id: string;
    pattern: string;
    matchType: 'PREFIX' | 'COUNTRY_CODE' | 'EXACT';
    action: 'BLOCK' | 'ALLOW';
    reason: string;
    active: boolean;
  }>
): { allowed: boolean; matchedReason?: string } {
  const activeRules = rules.filter((r) => r.active);
  const matches = activeRules.filter((rule) => {
    if (rule.matchType === 'EXACT') return destinationNumber === rule.pattern;
    return destinationNumber.startsWith(rule.pattern);
  });

  if (matches.length === 0) {
    return { allowed: true };
  }

  // Exact rules take priority over prefix/country rules; ALLOW overrides only at same or higher specificity
  const exactAllow = matches.find((m) => m.matchType === 'EXACT' && m.action === 'ALLOW');
  if (exactAllow) return { allowed: true };

  const exactBlock = matches.find((m) => m.matchType === 'EXACT' && m.action === 'BLOCK');
  if (exactBlock) return { allowed: false, matchedReason: exactBlock.reason };

  const blockRule = matches.find((m) => m.action === 'BLOCK');
  if (blockRule) {
    return { allowed: false, matchedReason: blockRule.reason };
  }

  return { allowed: true };
}

export class CallsService {
  constructor(
    private readonly prisma: AppPrismaClient,
    private readonly redis: RedisStore,
    private readonly env: AppEnv,
    private readonly telephony: TelephonyService,
    private readonly eventsHub: CallEventsHub
  ) {}

  async getEffectivePolicy(user: {
    maxCallDurationSeconds: number | null;
    dailyCallLimit: number | null;
    monthlyCallQuota: number | null;
  }): Promise<EffectiveOperationalPolicy> {
    const settings = await this.prisma.systemSetting.findMany();
    const map = new Map<string, number>();
    for (const s of settings) {
      if (typeof s.valueJson === 'number') {
        map.set(s.key, s.valueJson);
      }
    }

    return {
      maxCallDurationSeconds:
        user.maxCallDurationSeconds ??
        map.get('maxCallDurationSeconds') ??
        this.env.DEFAULT_MAX_CALL_DURATION_SECONDS,
      dailyCallLimit:
        user.dailyCallLimit ?? map.get('defaultDailyCallLimit') ?? this.env.DEFAULT_DAILY_CALL_LIMIT,
      monthlyCallQuota:
        user.monthlyCallQuota ??
        map.get('defaultMonthlyCallQuota') ??
        this.env.DEFAULT_MONTHLY_CALL_QUOTA,
      velocityWindowSeconds:
        map.get('velocityWindowSeconds') ?? this.env.VELOCITY_WINDOW_SECONDS,
      velocityMaxCalls: map.get('velocityMaxCalls') ?? this.env.VELOCITY_MAX_CALLS,
    };
  }

  async initiateCall(
    authUser: AuthenticatedUser,
    input: { callerIdId: string; destinationNumber: string },
    ipAddress?: string
  ) {
    const destinationNumber = input.destinationNumber.trim();
    if (!isValidE164(destinationNumber)) {
      throw new AppError(
        400,
        'INVALID_DESTINATION_NUMBER',
        'Destination number must be a valid E.164 number (e.g. +12025550144)'
      );
    }

    const callerId = await this.prisma.authorizedCallerId.findUnique({
      where: { id: input.callerIdId },
      include: { provider: true },
    });

    if (!callerId || !callerId.active || callerId.verificationStatus !== 'VERIFIED') {
      throw new AppError(400, 'INVALID_CALLER_ID', 'Selected caller ID is not active or verified');
    }

    if (!callerId.isGlobal && callerId.userId !== authUser.id) {
      await this.prisma.abuseReport.create({
        data: {
          reportedByUserId: authUser.id,
          targetUserId: authUser.id,
          category: 'SPOOFING_ATTEMPT',
          severity: 'HIGH',
          description: `User attempted to use unauthorized caller ID ${callerId.phoneNumber}`,
          status: 'OPEN',
        },
      });
      throw new AppError(
        403,
        'UNAUTHORIZED_CALLER_ID',
        'You are not authorized to place calls with this caller ID'
      );
    }

    const policy = await this.getEffectivePolicy(authUser);

    // Velocity fraud check via Redis sliding counter
    const velocityKey = `velocity:calls:${authUser.id}`;
    const recentBurstCount = await this.redis.incrWithTtl(velocityKey, policy.velocityWindowSeconds);
    if (recentBurstCount > policy.velocityMaxCalls) {
      await this.prisma.abuseReport.create({
        data: {
          targetUserId: authUser.id,
          category: 'HIGH_FREQUENCY',
          severity: 'MEDIUM',
          description: `Call velocity exceeded (${recentBurstCount} calls within ${policy.velocityWindowSeconds}s)`,
          status: 'OPEN',
        },
      });
      throw new AppError(
        429,
        'CALL_VELOCITY_EXCEEDED',
        'Too many call attempts in a short interval. Please wait before placing another call.'
      );
    }

    // Check destination restriction rules
    const restrictions = await this.prisma.destinationRestriction.findMany({
      where: { active: true },
    });
    const destinationDecision = evaluateDestinationRules(destinationNumber, restrictions);
    if (!destinationDecision.allowed) {
      const blockedRecord = await this.prisma.callRecord.create({
        data: {
          userId: authUser.id,
          callerIdId: callerId.id,
          providerId: callerId.providerId,
          callerIdNumber: callerId.phoneNumber,
          destinationNumber,
          mode: this.telephony.getRuntimeState().effectiveMode === 'live' ? 'LIVE' : 'MOCK',
          status: 'BLOCKED',
          terminationReason: destinationDecision.matchedReason || 'Destination restricted',
          failureCode: 'DESTINATION_RESTRICTED',
          endedAt: new Date(),
        },
      });

      await this.prisma.callEvent.create({
        data: {
          callRecordId: blockedRecord.id,
          eventType: 'CALL_BLOCKED',
          status: 'BLOCKED',
          metadataJson: { reason: destinationDecision.matchedReason ?? 'Restricted destination' } as never,
        },
      });

      await this.prisma.abuseReport.create({
        data: {
          targetUserId: authUser.id,
          callRecordId: blockedRecord.id,
          category: 'RESTRICTED_DESTINATION',
          severity: 'MEDIUM',
          description: `Blocked call attempt to restricted destination ${destinationNumber}`,
          status: 'OPEN',
        },
      });

      throw new AppError(
        403,
        'DESTINATION_RESTRICTED',
        destinationDecision.matchedReason || 'Destination number is restricted by policy'
      );
    }

    // Check daily and monthly call counts (operational limits, not monetary balances)
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [todayCount, monthCount] = await Promise.all([
      this.prisma.callRecord.count({
        where: {
          userId: authUser.id,
          startedAt: { gte: startOfDay },
          status: { not: 'BLOCKED' },
        },
      }),
      this.prisma.callRecord.count({
        where: {
          userId: authUser.id,
          startedAt: { gte: startOfMonth },
          status: { not: 'BLOCKED' },
        },
      }),
    ]);

    if (todayCount >= policy.dailyCallLimit) {
      throw new AppError(
        429,
        'DAILY_CALL_LIMIT_REACHED',
        `Daily operational limit of ${policy.dailyCallLimit} calls reached`
      );
    }

    if (monthCount >= policy.monthlyCallQuota) {
      throw new AppError(
        429,
        'MONTHLY_CALL_QUOTA_REACHED',
        `Monthly operational quota of ${policy.monthlyCallQuota} calls reached`
      );
    }

    const runtimeState = this.telephony.getRuntimeState();
    const callRecord = await this.prisma.callRecord.create({
      data: {
        userId: authUser.id,
        callerIdId: callerId.id,
        providerId: callerId.providerId,
        callerIdNumber: callerId.phoneNumber,
        destinationNumber,
        mode: runtimeState.effectiveMode === 'live' ? 'LIVE' : 'MOCK',
        status: 'INITIATED',
      },
    });

    let dispatchResult;
    try {
      dispatchResult = await this.telephony.initiateCall(
        {
          callRecordId: callRecord.id,
          callerIdNumber: callerId.phoneNumber,
          destinationNumber,
          maxDurationSeconds: policy.maxCallDurationSeconds,
          provider: {
            id: callerId.provider.id,
            code: callerId.provider.code,
            protocol: callerId.provider.protocol,
            enabled: callerId.provider.enabled,
            complianceVerified: callerId.provider.complianceVerified,
            sipDomain: callerId.provider.sipDomain,
            endpointUrl: callerId.provider.endpointUrl,
          },
        },
        {
          onStatusChange: async (recordId, nextStatus, details) => {
            await this.applyStatusTransition(recordId, nextStatus, details);
          },
        }
      );
    } catch (error) {
      await this.prisma.callRecord.update({
        where: { id: callRecord.id },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          terminationReason: error instanceof Error ? error.message : 'Dispatch error',
          failureCode: error instanceof AppError ? error.code : 'DISPATCH_ERROR',
        },
      });
      throw error;
    }

    const updated = await this.prisma.callRecord.update({
      where: { id: callRecord.id },
      data: {
        providerCallId: dispatchResult.providerCallId,
        mode: dispatchResult.mode,
        status: dispatchResult.initialStatus,
      },
    });

    await this.prisma.callEvent.create({
      data: {
        callRecordId: updated.id,
        eventType: 'CALL_INITIATED',
        status: updated.status,
        metadataJson: {
          mode: updated.mode,
          providerCallId: updated.providerCallId,
          maxDurationSeconds: policy.maxCallDurationSeconds,
        } as never,
      },
    });

    await recordAuditLog(this.prisma, {
      actorUserId: authUser.id,
      action: 'CALL_INITIATED',
      targetType: 'CallRecord',
      targetId: updated.id,
      details: {
        callerIdNumber: updated.callerIdNumber,
        destinationNumber: updated.destinationNumber,
        mode: updated.mode,
      },
      ipAddress: ipAddress ?? null,
    });

    this.publishCallEvent(updated);

    return {
      call: updated,
      maxDurationSeconds: policy.maxCallDurationSeconds,
      supportsMute: dispatchResult.supportsMute,
    };
  }

  async applyStatusTransition(
    callRecordId: string,
    nextStatus: CallTransitionStatus,
    details?: {
      terminationReason?: string;
      failureCode?: string;
      providerReportedCostMicros?: number;
      providerCurrency?: string;
    }
  ) {
    const existing = await this.prisma.callRecord.findUnique({
      where: { id: callRecordId },
    });
    if (!existing) return null;

    if (
      existing.status === 'COMPLETED' ||
      existing.status === 'FAILED' ||
      existing.status === 'CANCELED' ||
      existing.status === 'BLOCKED'
    ) {
      return existing;
    }

    const now = new Date();
    const isTerminal =
      nextStatus === 'COMPLETED' || nextStatus === 'FAILED' || nextStatus === 'CANCELED';

    const answeredAt =
      nextStatus === 'IN_PROGRESS' ? existing.answeredAt ?? now : existing.answeredAt;

    let durationSeconds = existing.durationSeconds;
    if (isTerminal && answeredAt) {
      durationSeconds = Math.max(0, Math.round((now.getTime() - answeredAt.getTime()) / 1000));
    }

    const updated = await this.prisma.callRecord.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        answeredAt,
        endedAt: isTerminal ? now : existing.endedAt,
        durationSeconds,
        terminationReason: details?.terminationReason ?? existing.terminationReason,
        failureCode: details?.failureCode ?? existing.failureCode,
        providerReportedCostMicros:
          details?.providerReportedCostMicros ?? existing.providerReportedCostMicros,
        providerCurrency: details?.providerCurrency ?? existing.providerCurrency,
      },
    });

    await this.prisma.callEvent.create({
      data: {
        callRecordId: updated.id,
        eventType: `CALL_${nextStatus}`,
        status: nextStatus,
        metadataJson: (details ?? {}) as never,
      },
    });

    this.publishCallEvent(updated);
    return updated;
  }

  async setMute(authUser: AuthenticatedUser, callId: string, muted: boolean) {
    const call = await this.prisma.callRecord.findUnique({ where: { id: callId } });
    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'Call record not found');
    }
    if (call.userId !== authUser.id && authUser.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'You cannot modify another user call');
    }
    if (
      call.status === 'COMPLETED' ||
      call.status === 'FAILED' ||
      call.status === 'CANCELED' ||
      call.status === 'BLOCKED'
    ) {
      throw new AppError(400, 'CALL_ALREADY_ENDED', 'Cannot mute a call that has already ended');
    }

    const muteResult = call.providerCallId
      ? await this.telephony.setMute(call.mode, call.providerCallId, muted)
      : { supported: false, muted: call.muted };

    if (!muteResult.supported) {
      throw new AppError(
        400,
        'MUTE_NOT_SUPPORTED',
        'Mute is not supported by the active telephony provider for this call'
      );
    }

    const updated = await this.prisma.callRecord.update({
      where: { id: call.id },
      data: { muted: muteResult.muted },
    });

    await this.prisma.callEvent.create({
      data: {
        callRecordId: updated.id,
        eventType: muteResult.muted ? 'CALL_MUTED' : 'CALL_UNMUTED',
        status: updated.status,
      },
    });

    this.publishCallEvent(updated);
    return updated;
  }

  async endCall(authUser: AuthenticatedUser, callId: string) {
    const call = await this.prisma.callRecord.findUnique({ where: { id: callId } });
    if (!call) {
      throw new AppError(404, 'CALL_NOT_FOUND', 'Call record not found');
    }
    if (call.userId !== authUser.id && authUser.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'You cannot end another user call');
    }
    if (
      call.status === 'COMPLETED' ||
      call.status === 'FAILED' ||
      call.status === 'CANCELED' ||
      call.status === 'BLOCKED'
    ) {
      return call;
    }

    if (call.providerCallId) {
      await this.telephony.endCall(call.mode, call.providerCallId);
    }

    const terminalStatus: CallTransitionStatus =
      call.status === 'IN_PROGRESS' ? 'COMPLETED' : 'CANCELED';

    const updated = await this.applyStatusTransition(call.id, terminalStatus, {
      terminationReason: 'USER_ENDED',
    });

    return updated ?? call;
  }

  private publishCallEvent(call: {
    id: string;
    userId: string;
    callerIdNumber: string;
    destinationNumber: string;
    providerCallId: string | null;
    mode: 'MOCK' | 'LIVE';
    status: string;
    muted: boolean;
    startedAt: Date;
    answeredAt: Date | null;
    endedAt: Date | null;
    durationSeconds: number;
    terminationReason: string | null;
    failureCode: string | null;
  }) {
    this.eventsHub.publish({
      type: 'call.status',
      userId: call.userId,
      call: {
        id: call.id,
        callerIdNumber: call.callerIdNumber,
        destinationNumber: call.destinationNumber,
        providerCallId: call.providerCallId,
        mode: call.mode,
        status: call.status,
        muted: call.muted,
        startedAt: call.startedAt.toISOString(),
        answeredAt: call.answeredAt ? call.answeredAt.toISOString() : null,
        endedAt: call.endedAt ? call.endedAt.toISOString() : null,
        durationSeconds: call.durationSeconds,
        terminationReason: call.terminationReason,
        failureCode: call.failureCode,
      },
      occurredAt: new Date().toISOString(),
    });
  }
}
