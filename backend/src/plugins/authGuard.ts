import type { FastifyRequest } from 'fastify';
import type { AppEnv } from '../config/env.js';
import type { AppPrismaClient } from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/auth.js';
import { AppError } from '../lib/errors.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  maxCallDurationSeconds: number | null;
  dailyCallLimit: number | null;
  monthlyCallQuota: number | null;
  defaultCallerIdId: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser;
  }
}

export function createAuthGuards(prisma: AppPrismaClient, env: AppEnv) {
  async function requireAuth(request: FastifyRequest): Promise<void> {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid Bearer token');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    let claims;
    try {
      claims = await verifyAccessToken(token, env.JWT_ACCESS_SECRET);
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
    });
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Account no longer exists');
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError(
        403,
        'ACCOUNT_SUSPENDED',
        user.suspensionReason || 'Your account has been suspended by an administrator'
      );
    }

    request.authUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      maxCallDurationSeconds: user.maxCallDurationSeconds,
      dailyCallLimit: user.dailyCallLimit,
      monthlyCallQuota: user.monthlyCallQuota,
      defaultCallerIdId: user.defaultCallerIdId,
    };
  }

  async function requireAdmin(request: FastifyRequest): Promise<void> {
    await requireAuth(request);
    if (request.authUser?.role !== 'ADMIN') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator privileges required');
    }
  }

  return { requireAuth, requireAdmin };
}
