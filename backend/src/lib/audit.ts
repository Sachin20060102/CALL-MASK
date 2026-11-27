import type { AppPrismaClient } from './prisma.js';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

export async function recordAuditLog(prisma: AppPrismaClient, input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      detailsJson: (input.details ?? {}) as never,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
