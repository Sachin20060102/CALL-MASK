import crypto from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import {
  TwilioTelephonyAdapter,
  mapTwilioStatus,
} from '../../src/modules/telephony/twilioTelephony.adapter.js';

describe('TwilioTelephonyAdapter', () => {
  it('maps Twilio call statuses accurately', () => {
    expect(mapTwilioStatus('queued')).toBe('INITIATED');
    expect(mapTwilioStatus('initiated')).toBe('INITIATED');
    expect(mapTwilioStatus('ringing')).toBe('RINGING');
    expect(mapTwilioStatus('in-progress')).toBe('IN_PROGRESS');
    expect(mapTwilioStatus('completed')).toBe('COMPLETED');
    expect(mapTwilioStatus('canceled')).toBe('CANCELED');
    expect(mapTwilioStatus('busy')).toBe('FAILED');
    expect(mapTwilioStatus('no-answer')).toBe('FAILED');
    expect(mapTwilioStatus('failed')).toBe('FAILED');
  });

  it('validates X-Twilio-Signature HMAC-SHA1 headers', () => {
    const env = loadEnv({
      TWILIO_ACCOUNT_SID: 'AC1234567890',
      TWILIO_AUTH_TOKEN: 'secret_twilio_auth_token',
    });
    const adapter = new TwilioTelephonyAdapter(env);
    const url = 'https://call-mask.onrender.com/api/v1/telephony/webhooks/twilio/status?callRecordId=call_1';
    const params = {
      CallSid: 'CA999',
      CallStatus: 'ringing',
    };
    const data = `${url}CallSidCA999CallStatusringing`;
    const validSig = crypto
      .createHmac('sha1', 'secret_twilio_auth_token')
      .update(data)
      .digest('base64');

    expect(adapter.validateSignature(validSig, url, params)).toBe(true);
    expect(adapter.validateSignature('bad_signature', url, params)).toBe(false);
  });

  it('generates Twilio Voice AccessToken JWT when WebRTC credentials are configured', async () => {
    const env = loadEnv({
      TWILIO_ACCOUNT_SID: 'AC1234567890',
      TWILIO_API_KEY_SID: 'SK1234567890',
      TWILIO_API_KEY_SECRET: 'twilio_api_key_secret_value_1234',
      TWILIO_TWIML_APP_SID: 'AP1234567890',
    });
    const adapter = new TwilioTelephonyAdapter(env);
    const token = await adapter.generateVoiceAccessToken('mococall_user_1');

    const header = decodeProtectedHeader(token);
    const payload = decodeJwt(token) as Record<string, any>;
    expect(header.cty).toBe('twilio-fpa;v=1');
    expect(payload.iss).toBe('SK1234567890');
    expect(payload.sub).toBe('AC1234567890');
    expect(payload.grants.identity).toBe('mococall_user_1');
    expect(payload.grants.voice.outgoing.application_sid).toBe('AP1234567890');
  });

  it('dispatches outbound call via Twilio REST API and hangs up via Calls/{sid}.json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ sid: 'CA000111222', status: 'queued' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ sid: 'CA000111222', status: 'completed' }),
      });

    const env = loadEnv({
      TELEPHONY_ENABLED: 'true',
      TELEPHONY_MODE: 'live',
      TELEPHONY_COMPLIANCE_VERIFIED: 'true',
      PUBLIC_API_BASE_URL: 'https://call-mask.onrender.com',
      TWILIO_ACCOUNT_SID: 'AC1234567890',
      TWILIO_AUTH_TOKEN: 'secret_twilio_auth_token',
      TWILIO_CALLER_ID: '+14155550199',
    });

    const adapter = new TwilioTelephonyAdapter(env, fetchMock as unknown as typeof fetch);
    const result = await adapter.initiateCall(
      {
        callRecordId: 'call_abc',
        callerIdNumber: '+14155550199',
        destinationNumber: '+919661988586',
        maxDurationSeconds: 600,
        provider: {
          id: 'prov_twilio',
          code: 'twilio-voice',
          protocol: 'VOIP_REST',
          enabled: true,
          complianceVerified: true,
          sipDomain: null,
          endpointUrl: 'https://api.twilio.com/2010-04-01',
        },
      },
      { onStatusChange: async () => {} }
    );

    expect(result).toEqual({
      providerCallId: 'CA000111222',
      mode: 'LIVE',
      initialStatus: 'INITIATED',
      supportsMute: false,
      transport: 'REST',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC1234567890/Calls.json');
    expect(String(init.body)).toContain('To=%2B919661988586');
    expect(String(init.body)).toContain('From=%2B14155550199');
    expect(String(init.body)).toContain('StatusCallback=https%3A%2F%2Fcall-mask.onrender.com');

    await adapter.endCall('CA000111222');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC1234567890/Calls/CA000111222.json'
    );
  });
});
