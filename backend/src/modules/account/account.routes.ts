import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppPrismaClient } from '../../lib/prisma.js';
import { hashPassword, verifyPassword } from '../../lib/auth.js';
import { recordAuditLog } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { CallsService } from '../calls/calls.service.js';

const updateSettingsSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  defaultCallerIdId: z.string().nullable().optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

export function registerAccountRoutes(
  app: FastifyInstance,
  deps: {
    prisma: AppPrismaClient;
    callsService: CallsService;
    requireAuth: (req: never) => Promise<void>;
  }
) {
  app.get('/api/v1/account/me', { preHandler: deps.requireAuth as never }, async (request) => {
    const user = await deps.prisma.user.findUnique({
      where: { id: request.authUser!.id },
    });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'Account not found');
    }
    const effectivePolicy = await deps.callsService.getEffectivePolicy(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        defaultCallerIdId: user.defaultCallerIdId,
        createdAt: user.createdAt,
      },
      limits: {
        maxCallDurationSeconds: effectivePolicy.maxCallDurationSeconds,
        dailyCallLimit: effectivePolicy.dailyCallLimit,
        monthlyCallQuota: effectivePolicy.monthlyCallQuota,
      },
    };
  });

  app.patch(
    '/api/v1/account/settings',
    { preHandler: deps.requireAuth as never },
    async (request) => {
      const body = updateSettingsSchema.parse(request.body);
      const user = await deps.prisma.user.findUnique({
        where: { id: request.authUser!.id },
      });
      if (!user) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Account not found');
      }

      const updateData: Record<string, unknown> = {};

      if (body.fullName !== undefined) {
        updateData.fullName = body.fullName.trim();
      }

      if (body.defaultCallerIdId !== undefined) {
        if (body.defaultCallerIdId !== null) {
          const cid = await deps.prisma.authorizedCallerId.findUnique({
            where: { id: body.defaultCallerIdId },
          });
          if (
            !cid ||
            !cid.active ||
            cid.verificationStatus !== 'VERIFIED' ||
            (!cid.isGlobal && cid.userId !== user.id)
          ) {
            throw new AppError(400, 'INVALID_CALLER_ID', 'Caller ID is not authorized for your account');
          }
        }
        updateData.defaultCallerIdId = body.defaultCallerIdId;
      }

      if (body.newPassword) {
        if (!body.currentPassword) {
          throw new AppError(
            400,
            'CURRENT_PASSWORD_REQUIRED',
            'Current password is required to set a new password'
          );
        }
        const ok = await verifyPassword(body.currentPassword, user.passwordHash);
        if (!ok) {
          throw new AppError(401, 'INVALID_PASSWORD', 'Current password is incorrect');
        }
        updateData.passwordHash = await hashPassword(body.newPassword);
      }

      const updated = await deps.prisma.user.update({
        where: { id: user.id },
        data: updateData as never,
      });

      await recordAuditLog(deps.prisma, {
        actorUserId: user.id,
        action: 'ACCOUNT_SETTINGS_UPDATED',
        targetType: 'User',
        targetId: user.id,
        details: {
          updatedFields: Object.keys(updateData).filter((k) => k !== 'passwordHash'),
          passwordChanged: Boolean(updateData.passwordHash),
        },
        ipAddress: request.ip,
      });

      return {
        user: {
          id: updated.id,
          email: updated.email,
          fullName: updated.fullName,
          role: updated.role,
          status: updated.status,
          defaultCallerIdId: updated.defaultCallerIdId,
          createdAt: updated.createdAt,
        },
      };
    }
  );
}
