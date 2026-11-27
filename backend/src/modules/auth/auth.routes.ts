import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppEnv } from '../../config/env.js';
import type { AppPrismaClient } from '../../lib/prisma.js';
import type { RedisStore } from '../../lib/redis.js';
import {
  generateOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyPassword,
} from '../../lib/auth.js';
import { recordAuditLog } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';

const registerSchema = z.object({
  email: z.string().email().max(191),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(120),
});

const loginSchema = z.object({
  email: z.string().email().max(191),
  password: z.string().min(1).max(128),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

function sanitizeUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  defaultCallerIdId: string | null;
  maxCallDurationSeconds: number | null;
  dailyCallLimit: number | null;
  monthlyCallQuota: number | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    defaultCallerIdId: user.defaultCallerIdId,
    maxCallDurationSeconds: user.maxCallDurationSeconds,
    dailyCallLimit: user.dailyCallLimit,
    monthlyCallQuota: user.monthlyCallQuota,
    createdAt: user.createdAt,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: { prisma: AppPrismaClient; redis: RedisStore; env: AppEnv }
) {
  async function issueSession(user: { id: string; email: string; role: 'USER' | 'ADMIN' }) {
    const accessToken = await signAccessToken(
      { sub: user.id, email: user.email, role: user.role },
      deps.env.JWT_ACCESS_SECRET,
      deps.env.JWT_ACCESS_TTL_SECONDS
    );

    const refreshToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(refreshToken);
    const expiresAt = new Date(Date.now() + deps.env.JWT_REFRESH_TTL_SECONDS * 1000);

    await deps.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  app.post('/api/v1/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const existing = await deps.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
    }

    const defaultGlobalCid = await deps.prisma.authorizedCallerId.findFirst({
      where: { isGlobal: true, active: true, verificationStatus: 'VERIFIED' },
    });

    const passwordHash = await hashPassword(body.password);
    const user = await deps.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName: body.fullName.trim(),
        role: 'USER',
        status: 'ACTIVE',
        defaultCallerIdId: defaultGlobalCid?.id ?? null,
      },
    });

    const tokens = await issueSession(user);

    await recordAuditLog(deps.prisma, {
      actorUserId: user.id,
      action: 'USER_REGISTERED',
      targetType: 'User',
      targetId: user.id,
      details: { email: user.email },
      ipAddress: request.ip,
    });

    return reply.status(201).send({
      user: sanitizeUser(user),
      ...tokens,
    });
  });

  app.post('/api/v1/auth/login', async (request) => {
    const body = loginSchema.parse(request.body);
    const normalizedEmail = body.email.trim().toLowerCase();

    const loginAttemptsKey = `auth:attempts:${normalizedEmail}`;
    const attempts = await deps.redis.incrWithTtl(loginAttemptsKey, 300);
    if (attempts > 20) {
      throw new AppError(429, 'TOO_MANY_LOGIN_ATTEMPTS', 'Too many login attempts; try again later');
    }

    const user = await deps.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    if (user.status === 'SUSPENDED') {
      throw new AppError(
        403,
        'ACCOUNT_SUSPENDED',
        user.suspensionReason || 'Your account has been suspended'
      );
    }

    await deps.redis.del(loginAttemptsKey);
    const tokens = await issueSession(user);

    await recordAuditLog(deps.prisma, {
      actorUserId: user.id,
      action: 'USER_LOGIN',
      targetType: 'User',
      targetId: user.id,
      ipAddress: request.ip,
    });

    return {
      user: sanitizeUser(user),
      ...tokens,
    };
  });

  app.post('/api/v1/auth/refresh', async (request) => {
    const body = refreshSchema.parse(request.body);
    const tokenHash = hashOpaqueToken(body.refreshToken);

    const stored = await deps.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    if (stored.user.status === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account has been suspended');
    }

    await deps.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await issueSession(stored.user);
    return {
      user: sanitizeUser(stored.user),
      ...tokens,
    };
  });

  app.post('/api/v1/auth/logout', async (request) => {
    const body = refreshSchema.parse(request.body);
    const tokenHash = hashOpaqueToken(body.refreshToken);
    const stored = await deps.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (stored && !stored.revokedAt) {
      await deps.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  });
}
