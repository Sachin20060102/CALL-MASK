import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Updated zero-payment specification compliance', () => {
  it('Prisma schema excludes wallet_accounts, wallet_transactions, payment_orders, and pricing_rules', () => {
    const schemaPath = path.resolve(import.meta.dirname, '../../prisma/schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    expect(schema).not.toMatch(/wallet_accounts/i);
    expect(schema).not.toMatch(/wallet_transactions/i);
    expect(schema).not.toMatch(/payment_orders/i);
    expect(schema).not.toMatch(/pricing_rules/i);

    expect(schema).toContain('model CallRecord');
    expect(schema).toContain('model AuthorizedCallerId');
    expect(schema).toContain('model DestinationRestriction');
    expect(schema).toContain('model AbuseReport');
    expect(schema).toContain('model AuditLog');
  });
});
