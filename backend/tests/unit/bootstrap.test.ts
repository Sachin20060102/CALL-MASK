import { describe, expect, it } from 'vitest';
import { ensureOperationalBootstrap } from '../../src/lib/bootstrap.js';
import { createInMemoryPrisma } from '../helpers/inMemoryPrisma.js';

describe('Operational bootstrap', () => {
  it('seeds default mock provider, authorized caller IDs, restrictions, and settings idempotently', async () => {
    const { raw, client } = createInMemoryPrisma();

    await ensureOperationalBootstrap(client, {
      BOOTSTRAP_ADMIN_EMAIL: 'ops-admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongPassword123!',
    });

    expect(raw.telephonyProviders.length).toBe(2);
    expect(raw.authorizedCallerIds.length).toBe(2);
    expect(raw.destinationRestrictions.length).toBe(2);
    expect(raw.systemSettings.length).toBe(5);
    expect(raw.users.find((u) => u.email === 'ops-admin@example.com')?.role).toBe('ADMIN');

    // Second run stays idempotent
    await ensureOperationalBootstrap(client, {
      BOOTSTRAP_ADMIN_EMAIL: 'ops-admin@example.com',
      BOOTSTRAP_ADMIN_PASSWORD: 'StrongPassword123!',
    });

    expect(raw.telephonyProviders.length).toBe(2);
    expect(raw.authorizedCallerIds.length).toBe(2);
    expect(raw.users.length).toBe(1);
  });
});
