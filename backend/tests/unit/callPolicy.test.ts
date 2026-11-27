import { describe, expect, it } from 'vitest';
import {
  evaluateDestinationRules,
  isValidE164,
  normalizeE164,
} from '../../src/modules/calls/calls.service.js';

describe('Call policy & E.164 validation', () => {
  it('normalizes formatted numbers and validates E.164 strictly', () => {
    expect(normalizeE164(' +91 96619-88586 ')).toBe('+919661988586');
    expect(isValidE164('+1 (415) 555-0101')).toBe(true);
    expect(isValidE164('+442079460958')).toBe(true);
    expect(isValidE164('14155550101')).toBe(false);
    expect(isValidE164('+0123456')).toBe(false);
    expect(isValidE164('invalid')).toBe(false);
  });

  it('blocks matching prefix/country restrictions and permits exact allow override', () => {
    const rules = [
      {
        id: 'r1',
        pattern: '+1900',
        matchType: 'PREFIX' as const,
        action: 'BLOCK' as const,
        reason: 'Premium number blocked',
        active: true,
      },
      {
        id: 'r2',
        pattern: '+19005550100',
        matchType: 'EXACT' as const,
        action: 'ALLOW' as const,
        reason: 'Approved test line',
        active: true,
      },
    ];

    expect(evaluateDestinationRules('+19005559999', rules)).toEqual({
      allowed: false,
      matchedReason: 'Premium number blocked',
    });
    expect(evaluateDestinationRules('+19005550100', rules)).toEqual({ allowed: true });
    expect(evaluateDestinationRules('+12025550155', rules)).toEqual({ allowed: true });
  });
});
