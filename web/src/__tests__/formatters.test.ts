import { describe, expect, it } from 'vitest';
import { resolveApiBaseUrl } from '../api/client';
import {
  formatDuration,
  isTerminalCallStatus,
  isValidE164,
  normalizeE164Input,
} from '../utils/formatters';

describe('Web formatters & API URL resolution', () => {
  it('formats call durations consistently', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(75)).toBe('01:15');
    expect(formatDuration(3665)).toBe('01:01:05');
  });

  it('normalizes and validates E.164 dialer input', () => {
    expect(normalizeE164Input(' +91 96619-88586 ')).toBe('+919661988586');
    expect(isValidE164('+91 96619-88586')).toBe(true);
    expect(isValidE164('9661988586')).toBe(false);
  });

  it('identifies terminal call statuses accurately', () => {
    expect(isTerminalCallStatus('COMPLETED')).toBe(true);
    expect(isTerminalCallStatus('FAILED')).toBe(true);
    expect(isTerminalCallStatus('CANCELED')).toBe(true);
    expect(isTerminalCallStatus('BLOCKED')).toBe(true);
    expect(isTerminalCallStatus('RINGING')).toBe(false);
    expect(isTerminalCallStatus('IN_PROGRESS')).toBe(false);
  });

  it('uses same-origin /api/v1 on remote hosts instead of loopback localhost:4000', () => {
    expect(resolveApiBaseUrl({ hostname: 'localhost', envBaseUrl: '', runtimeBaseUrl: '' })).toBe(
      'http://localhost:4000/api/v1'
    );
    expect(
      resolveApiBaseUrl({ hostname: 'maskcall.thisisnavneet.in', envBaseUrl: '', runtimeBaseUrl: '' })
    ).toBe('/api/v1');
    expect(
      resolveApiBaseUrl({
        hostname: 'maskcall.thisisnavneet.in',
        runtimeBaseUrl: 'https://api.maskcall.thisisnavneet.in/api/v1/',
      })
    ).toBe('https://api.maskcall.thisisnavneet.in/api/v1');
  });
});
