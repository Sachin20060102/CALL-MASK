import type { AppPrismaClient } from './prisma.js';
import { hashPassword } from './auth.js';

/**
 * Ensures a newly migrated database has default mock telephony provider,
 * authorized global caller IDs, default destination restrictions, and
 * operational policy settings without requiring a separate manual seed step.
 */
export async function ensureOperationalBootstrap(
  prisma: AppPrismaClient,
  env: Record<string, string | undefined> = process.env
): Promise<void> {
  const existingProviders = await prisma.telephonyProvider.count();
  if (existingProviders === 0) {
    const mockProvider = await prisma.telephonyProvider.upsert({
      where: { code: 'mock-sandbox' },
      update: {},
      create: {
        name: 'Mock Telephony Sandbox',
        code: 'mock-sandbox',
        protocol: 'MOCK',
        enabled: true,
        complianceVerified: true,
        healthStatus: 'HEALTHY',
        lastHealthCheckAt: new Date(),
      },
    });

    await prisma.telephonyProvider.upsert({
      where: { code: 'authorized-sip-primary' },
      update: {},
      create: {
        name: 'Authorized SIP Carrier (Disabled by Default)',
        code: 'authorized-sip-primary',
        protocol: 'SIP',
        enabled: false,
        complianceVerified: false,
        sipDomain: 'sip.example-carrier.invalid',
        healthStatus: 'DISABLED',
      },
    });

    await prisma.authorizedCallerId.upsert({
      where: {
        phoneNumber_providerId: {
          phoneNumber: '+14155550101',
          providerId: mockProvider.id,
        },
      },
      update: {},
      create: {
        providerId: mockProvider.id,
        phoneNumber: '+14155550101',
        label: 'Operations Main Line',
        verificationStatus: 'VERIFIED',
        isGlobal: true,
        active: true,
      },
    });

    await prisma.authorizedCallerId.upsert({
      where: {
        phoneNumber_providerId: {
          phoneNumber: '+14155550102',
          providerId: mockProvider.id,
        },
      },
      update: {},
      create: {
        providerId: mockProvider.id,
        phoneNumber: '+14155550102',
        label: 'Support Dispatch Line',
        verificationStatus: 'VERIFIED',
        isGlobal: true,
        active: true,
      },
    });

    const defaultRestrictions = [
      {
        pattern: '+1900',
        matchType: 'PREFIX' as const,
        action: 'BLOCK' as const,
        reason: 'High-risk premium prefix blocked by policy',
      },
      {
        pattern: '+881',
        matchType: 'COUNTRY_CODE' as const,
        action: 'BLOCK' as const,
        reason: 'Satellite range restricted by compliance policy',
      },
    ];

    for (const r of defaultRestrictions) {
      const existing = await prisma.destinationRestriction.findFirst({
        where: { pattern: r.pattern, matchType: r.matchType },
      });
      if (!existing) {
        await prisma.destinationRestriction.create({ data: r });
      }
    }

    const defaultSettings: Array<{ key: string; valueJson: number }> = [
      { key: 'maxCallDurationSeconds', valueJson: 1800 },
      { key: 'defaultDailyCallLimit', valueJson: 50 },
      { key: 'defaultMonthlyCallQuota', valueJson: 500 },
      { key: 'velocityWindowSeconds', valueJson: 60 },
      { key: 'velocityMaxCalls', valueJson: 5 },
    ];

    for (const setting of defaultSettings) {
      await prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {},
        create: {
          key: setting.key,
          valueJson: setting.valueJson as never,
        },
      });
    }
  }

  const adminEmail = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (adminEmail && adminPassword && adminPassword.length >= 8) {
    const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
      const passwordHash = await hashPassword(adminPassword);
      await prisma.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          fullName: env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Platform Administrator',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });
    }
  }
}
