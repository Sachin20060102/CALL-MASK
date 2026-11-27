import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

async function main() {
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

  const globalCid1 = await prisma.authorizedCallerId.upsert({
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

  const adminPasswordHash = await hashPassword('AdminPass123!');
  const userPasswordHash = await hashPassword('UserPass123!');

  await prisma.user.upsert({
    where: { email: 'admin@mococall.local' },
    update: {},
    create: {
      email: 'admin@mococall.local',
      passwordHash: adminPasswordHash,
      fullName: 'MocoCall Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      defaultCallerIdId: globalCid1.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'operator@mococall.local' },
    update: {},
    create: {
      email: 'operator@mococall.local',
      passwordHash: userPasswordHash,
      fullName: 'Alex Operator',
      role: 'USER',
      status: 'ACTIVE',
      defaultCallerIdId: globalCid1.id,
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

  const defaultSettings: Array<{ key: string; valueJson: unknown }> = [
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

  console.log('Seed completed successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
