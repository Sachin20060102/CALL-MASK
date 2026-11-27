import { describe, expect, it } from 'vitest';
import { ensureOperationalBootstrap } from '../../src/lib/bootstrap.js';
import { createInMemoryPrisma } from '../helpers/inMemoryPrisma.js';

describe('Operational bootstrap', () => {
  it('seeds default mock provider, authorized caller IDs, restrictions, and settings idempotently', async () => {
    const { raw, client } = createInMemoryPrisma();

    await ensureOperationalBootstrap(client, {
      BOOTSTRAP_ADMIN_EMAIL: 'ops-admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongPassword123!',
      TWILIO_ACCOUNT_SID: 'AC1234567890',
      TWILIO_CALLER_ID: '+14155550199',
      TELEPHONY_ENABLED: 'true',
      TELEPHONY_COMPLIANCE_VERIFIED: 'true',
    });

    expect(raw.telephonyProviders.length).toBe(3);
    expect(raw.authorizedCallerIds.length).toBe(3);
    expect(raw.destinationRestrictions.length).toBe(2);
    expect(raw.systemSettings.length).toBe(5);
    expect(raw.users.find((u) => u.email === 'ops-admin@example.com')?.role).toBe('ADMIN');
    expect(
      raw.authorizedCallerIds.find((c) => c.phoneNumber === '+14155550199')?.verificationStatus
    ).toBe('VERIFIED');

    // Second run stays idempotent
    await ensureOperationalBootstrap(client, {
      BOOTSTRAP_ADMIN_EMAIL: 'ops-admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongPassword123!',
      TWILIO_ACCOUNT_SID: 'AC1234567890',
      TWILIO_CALLER_ID: '+14155550199',
      TELEPHONY_ENABLED: 'true',
      TELEPHONY_COMPLIANCE_VERIFIED: 'true',
    });

    expect(raw.telephonyProviders.length).toBe(3);
    expect(raw.authorizedCallerIds.length).toBe(3);
    expect(raw.users.length).toBe(1);
  });
});
