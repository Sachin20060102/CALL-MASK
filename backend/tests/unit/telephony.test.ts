import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { TelephonyService } from '../../src/modules/telephony/telephony.service.js';

describe('TelephonyService safety gate & mock adapter', () => {
  it('defaults TELEPHONY_ENABLED to false and TELEPHONY_MODE to mock', () => {
    const env = loadEnv({});
    expect(env.TELEPHONY_ENABLED).toBe(false);
    expect(env.TELEPHONY_MODE).toBe('mock');
    expect(env.TELEPHONY_COMPLIANCE_VERIFIED).toBe(false);

    const telephony = new TelephonyService(env);
    expect(telephony.getRuntimeState()).toEqual({
      enabled: false,
      configuredMode: 'mock',
      complianceVerified: false,
      effectiveMode: 'mock',
      twilioConfigured: false,
      twilioWebRtcConfigured: false,
    });
  });

  it('blocks live SIP dispatch when TELEPHONY_COMPLIANCE_VERIFIED is false', async () => {
    const env = loadEnv({
      TELEPHONY_ENABLED: 'true',
      TELEPHONY_MODE: 'live',
      TELEPHONY_COMPLIANCE_VERIFIED: 'false',
    });
    const telephony = new TelephonyService(env);

    await expect(
      telephony.initiateCall(
        {
          callRecordId: 'call_1',
          callerIdNumber: '+14155550101',
          destinationNumber: '+12025550199',
          maxDurationSeconds: 600,
          provider: {
            id: 'prov_sip',
            code: 'sip-main',
            protocol: 'SIP',
            enabled: true,
            complianceVerified: true,
            sipDomain: 'sip.example.com',
            endpointUrl: null,
          },
        },
        { onStatusChange: async () => {} }
      )
    ).rejects.toMatchObject({
      code: 'TELEPHONY_COMPLIANCE_REQUIRED',
      statusCode: 503,
    });
  });

  it('transitions mock calls through RINGING -> IN_PROGRESS and supports mute/end', async () => {
    const env = loadEnv({});
    const telephony = new TelephonyService(env, { ringDelayMs: 20, answerDelayMs: 30 });
    const transitions: string[] = [];

    const result = await telephony.initiateCall(
      {
        callRecordId: 'call_mock_1',
        callerIdNumber: '+14155550101',
        destinationNumber: '+12025550199',
        maxDurationSeconds: 600,
        provider: {
          id: 'prov_mock',
          code: 'mock-sandbox',
          protocol: 'MOCK',
          enabled: true,
          complianceVerified: true,
          sipDomain: null,
          endpointUrl: null,
        },
      },
      {
        onStatusChange: async (_id, status) => {
          transitions.push(status);
        },
      }
    );

    expect(result.mode).toBe('MOCK');
    expect(result.providerCallId).toMatch(/^mock_call_/);
    expect(result.supportsMute).toBe(true);

    await new Promise((r) => setTimeout(r, 90));
    expect(transitions).toEqual(['RINGING', 'IN_PROGRESS']);

    const muteRes = await telephony.setMute('MOCK', result.providerCallId, true);
    expect(muteRes).toEqual({ supported: true, muted: true });

    await telephony.endCall('MOCK', result.providerCallId);
    await telephony.shutdown();
  });
});
