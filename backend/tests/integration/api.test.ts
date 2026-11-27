import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { hashPassword } from '../../src/lib/auth.js';
import { InMemoryRedisStore } from '../../src/lib/redis.js';
import { createInMemoryPrisma, type InMemoryPrisma } from '../helpers/inMemoryPrisma.js';

describe('MocoCall API integration suite (payment-free operational calling)', () => {
  let app: FastifyInstance;
  let db: InMemoryPrisma;
  let adminToken = '';
  let userToken = '';
  let userRefreshToken = '';
  let callerIdId = '';
  let mockProviderId = '';

  beforeAll(async () => {
    const mem = createInMemoryPrisma();
    db = mem.raw;
    const redis = new InMemoryRedisStore();
    const env = loadEnv({
      NODE_ENV: 'test',
      TELEPHONY_ENABLED: 'false',
      TELEPHONY_MODE: 'mock',
    });

    const mockProvider = await mem.client.telephonyProvider.create({
      data: {
        name: 'Mock Telephony Sandbox',
        code: 'mock-sandbox',
        protocol: 'MOCK',
        enabled: true,
        complianceVerified: true,
        healthStatus: 'HEALTHY',
      },
    });
    mockProviderId = mockProvider.id;

    const globalCid = await mem.client.authorizedCallerId.create({
      data: {
        providerId: mockProvider.id,
        phoneNumber: '+14155550101',
        label: 'Operations Desk',
        verificationStatus: 'VERIFIED',
        isGlobal: true,
        active: true,
      },
    });
    callerIdId = globalCid.id;

    await mem.client.destinationRestriction.create({
      data: {
        pattern: '+1900',
        matchType: 'PREFIX',
        action: 'BLOCK',
        reason: 'Premium numbers blocked',
        active: true,
      },
    });

    const adminHash = await hashPassword('AdminPass123!');
    await mem.client.user.create({
      data: {
        email: 'admin@mococall.local',
        passwordHash: adminHash,
        fullName: 'Platform Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
        defaultCallerIdId: callerIdId,
      },
    });

    app = await buildApp({
      env,
      prisma: mem.client,
      redis,
      mockTelephonyOptions: { ringDelayMs: 15, answerDelayMs: 25 },
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes /api/v1/health showing telephony disabled by default and no payment services', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.telephony.enabled).toBe(false);
    expect(body.telephony.mode).toBe('mock');
  });

  it('rejects all removed payment, wallet, and pricing endpoints with 404', async () => {
    const removedRoutes: Array<{ method: 'GET' | 'POST'; url: string }> = [
      { method: 'POST', url: '/api/v1/payments/create-order' },
      { method: 'POST', url: '/api/v1/payments/verify' },
      { method: 'GET', url: '/api/v1/payments/ord_123' },
      { method: 'GET', url: '/api/v1/wallet' },
      { method: 'GET', url: '/api/v1/wallet/transactions' },
      { method: 'GET', url: '/api/v1/wallet/packages' },
      { method: 'GET', url: '/api/v1/pricing/countries' },
      { method: 'GET', url: '/api/v1/pricing/rates' },
      { method: 'POST', url: '/api/v1/pricing/estimate' },
    ];

    for (const route of removedRoutes) {
      const res = await app.inject({ method: route.method, url: route.url });
      expect(res.statusCode).toBe(404);
    }
  });

  it('supports user registration, login, refresh, caller ID selection, mock calling, mute, end, and usage tracking', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'caller@example.com',
        password: 'CallerPass123!',
        fullName: 'Casey Caller',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const regBody = regRes.json();
    expect(regBody.user.email).toBe('caller@example.com');
    expect(regBody.user).not.toHaveProperty('balance');
    userToken = regBody.accessToken;
    userRefreshToken = regBody.refreshToken;

    // Refresh token rotation
    const refRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: userRefreshToken },
    });
    expect(refRes.statusCode).toBe(200);
    userToken = refRes.json().accessToken;
    userRefreshToken = refRes.json().refreshToken;

    // Fetch authorized caller IDs
    const cidRes = await app.inject({
      method: 'GET',
      url: '/api/v1/caller-ids',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(cidRes.statusCode).toBe(200);
    expect(cidRes.json().callerIds).toHaveLength(1);
    expect(cidRes.json().callerIds[0].phoneNumber).toBe('+14155550101');

    // Restricted destination is blocked
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/calls',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { callerIdId, destinationNumber: '+19005551234' },
    });
    expect(blockedRes.statusCode).toBe(403);
    expect(blockedRes.json().error.code).toBe('DESTINATION_RESTRICTED');

    // Place valid mock call
    const callRes = await app.inject({
      method: 'POST',
      url: '/api/v1/calls',
      headers: { authorization: `Bearer ${userToken}` },
      payload: { callerIdId, destinationNumber: '+12025550188' },
    });
    expect(callRes.statusCode).toBe(201);
    const callId = callRes.json().call.id;
    expect(callRes.json().call.mode).toBe('MOCK');

    // Wait for mock RINGING -> IN_PROGRESS transition
    await new Promise((r) => setTimeout(r, 90));

    // Mute active call
    const muteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/mute`,
      headers: { authorization: `Bearer ${userToken}` },
      payload: { muted: true },
    });
    expect(muteRes.statusCode).toBe(200);
    expect(muteRes.json().call.muted).toBe(true);

    // End active call
    const endRes = await app.inject({
      method: 'POST',
      url: `/api/v1/calls/${callId}/end`,
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(endRes.statusCode).toBe(200);
    expect(endRes.json().call.status).toBe('COMPLETED');
    expect(endRes.json().call.endedAt).toBeTruthy();

    // Check usage stats & history
    const usageRes = await app.inject({
      method: 'GET',
      url: '/api/v1/usage/summary',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(usageRes.statusCode).toBe(200);
    expect(usageRes.json().completedCalls).toBe(1);
    expect(usageRes.json().blockedCalls).toBe(1);
    expect(usageRes.json().todayCalls).toBe(1);

    const historyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/calls',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.json().items.length).toBe(2);
  });

  it('supports admin operational analytics, carrier telemetry isolation, user suspension, and audit logs', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'admin@mococall.local', password: 'AdminPass123!' },
    });
    expect(loginRes.statusCode).toBe(200);
    adminToken = loginRes.json().accessToken;

    const overviewRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(overviewRes.statusCode).toBe(200);
    expect(overviewRes.json().metrics.completedCalls).toBe(1);

    const providerCostRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/provider-costs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(providerCostRes.statusCode).toBe(200);
    expect(providerCostRes.json().providers[0].providerId).toBe(mockProviderId);
    expect(providerCostRes.json().scopeNote).toContain('Platform-owner carrier telemetry only');

    // Suspend the test caller and verify subsequent calls are blocked
    const targetUser = db.users.find((u) => u.email === 'caller@example.com');
    const suspRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${targetUser!.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'SUSPENDED', suspensionReason: 'Policy audit' },
    });
    expect(suspRes.statusCode).toBe(200);

    const blockedUserRes = await app.inject({
      method: 'GET',
      url: '/api/v1/usage/summary',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(blockedUserRes.statusCode).toBe(403);
    expect(blockedUserRes.json().error.code).toBe('ACCOUNT_SUSPENDED');

    const auditRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().logs.length).toBeGreaterThan(0);

    const tokenRes = await app.inject({
      method: 'GET',
      url: '/api/v1/telephony/twilio/token',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(tokenRes.statusCode).toBe(200);
    expect(tokenRes.json().webrtcEnabled).toBe(false);
  });
});
