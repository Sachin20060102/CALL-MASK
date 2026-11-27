import crypto from 'node:crypto';
import { SignJWT } from 'jose';
import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type {
  CallTransitionStatus,
  InitiateOutboundCallRequest,
  InitiateOutboundCallResult,
  ProviderStatusCallback,
  TelephonyAdapter,
} from './telephony.types.js';

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function mapTwilioStatus(twilioStatus: string | undefined): CallTransitionStatus {
  const normalized = (twilioStatus ?? '').trim().toLowerCase();
  if (normalized === 'ringing') return 'RINGING';
  if (normalized === 'in-progress' || normalized === 'answered') return 'IN_PROGRESS';
  if (normalized === 'completed') return 'COMPLETED';
  if (normalized === 'canceled') return 'CANCELED';
  if (normalized === 'busy' || normalized === 'no-answer' || normalized === 'failed') {
    return 'FAILED';
  }
  return 'INITIATED';
}

export class TwilioTelephonyAdapter implements TelephonyAdapter {
  private readonly fetchFn: typeof fetch;

  constructor(private readonly env: AppEnv, fetchImpl?: typeof fetch) {
    this.fetchFn = fetchImpl ?? fetch;
  }

  isRestConfigured(): boolean {
    return Boolean(this.env.TWILIO_ACCOUNT_SID && this.env.TWILIO_AUTH_TOKEN);
  }

  isWebRtcConfigured(): boolean {
    return Boolean(
      this.env.TWILIO_ACCOUNT_SID &&
        this.env.TWILIO_API_KEY_SID &&
        this.env.TWILIO_API_KEY_SECRET &&
        this.env.TWILIO_TWIML_APP_SID
    );
  }

  private getAuthHeader(): string {
    const token = Buffer.from(
      `${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`,
      'utf8'
    ).toString('base64');
    return `Basic ${token}`;
  }

  async generateVoiceAccessToken(identity: string, ttlSeconds = 3600): Promise<string> {
    if (!this.isWebRtcConfigured()) {
      throw new AppError(
        503,
        'TWILIO_WEBRTC_NOT_CONFIGURED',
        'Twilio WebRTC requires TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, and TWILIO_TWIML_APP_SID'
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    return new SignJWT({
      grants: {
        identity,
        voice: {
          outgoing: {
            application_sid: this.env.TWILIO_TWIML_APP_SID!,
          },
          incoming: {
            allow: false,
          },
        },
      },
    })
      .setProtectedHeader({
        typ: 'JWT',
        alg: 'HS256',
        cty: 'twilio-fpa;v=1',
      })
      .setJti(`${this.env.TWILIO_API_KEY_SID}-${nowSec}`)
      .setIssuer(this.env.TWILIO_API_KEY_SID!)
      .setSubject(this.env.TWILIO_ACCOUNT_SID!)
      .setNotBefore(nowSec)
      .setExpirationTime(nowSec + ttlSeconds)
      .sign(encoder.encode(this.env.TWILIO_API_KEY_SECRET!));
  }

  validateSignature(
    signatureHeader: string | undefined,
    fullUrl: string,
    params: Record<string, string>
  ): boolean {
    const authToken = this.env.TWILIO_AUTH_TOKEN;
    if (!signatureHeader || !authToken) return false;

    let data = fullUrl;
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }

    const computed = crypto.createHmac('sha1', authToken).update(data).digest('base64');
    const a = Buffer.from(signatureHeader.trim(), 'utf8');
    const b = Buffer.from(computed, 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  buildStatusCallbackUrl(callRecordId: string): string | null {
    if (!this.env.PUBLIC_API_BASE_URL) return null;
    const base = this.env.PUBLIC_API_BASE_URL.replace(/\/+$/, '');
    return `${base}/api/v1/telephony/webhooks/twilio/status?callRecordId=${encodeURIComponent(callRecordId)}`;
  }

  async initiateCall(
    req: InitiateOutboundCallRequest,
    _callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult> {
    if (!this.env.TELEPHONY_ENABLED || !this.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      throw new AppError(
        503,
        'TELEPHONY_DISABLED',
        'Live Twilio calling is disabled until TELEPHONY_ENABLED=true and TELEPHONY_COMPLIANCE_VERIFIED=true.'
      );
    }

    if (!req.provider.enabled || !req.provider.complianceVerified) {
      throw new AppError(
        503,
        'PROVIDER_NOT_VERIFIED',
        'Selected telephony provider is not enabled and compliance-verified.'
      );
    }

    if (!this.isRestConfigured()) {
      throw new AppError(
        503,
        'TWILIO_NOT_CONFIGURED',
        'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be configured for live Twilio calling.'
      );
    }

    const useWebRtc =
      this.isWebRtcConfigured() &&
      (req.requestedTransport === 'WEBRTC' || req.requestedTransport === 'AUTO' || !req.requestedTransport);

    if (useWebRtc) {
      return {
        providerCallId: `webrtc_pending_${req.callRecordId}`,
        mode: 'LIVE',
        initialStatus: 'INITIATED',
        supportsMute: true,
        transport: 'WEBRTC',
      };
    }

    const form = new URLSearchParams();
    form.set('From', req.callerIdNumber);
    form.set('To', req.destinationNumber);
    form.set('TimeLimit', String(req.maxDurationSeconds));
    form.set(
      'Twiml',
      `<Response><Say voice="alice">${escapeXml(this.env.TWILIO_DEFAULT_MESSAGE)}</Say><Pause length="25"/></Response>`
    );

    const statusCallbackUrl = this.buildStatusCallbackUrl(req.callRecordId);
    if (statusCallbackUrl) {
      form.set('StatusCallback', statusCallbackUrl);
      form.set('StatusCallbackMethod', 'POST');
      for (const evt of ['initiated', 'ringing', 'answered', 'completed']) {
        form.append('StatusCallbackEvent', evt);
      }
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Calls.json`;
    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number;
      message?: string;
    };

    if (!res.ok || !data.sid) {
      const detail = data.message || `Twilio API returned HTTP ${res.status}`;
      const codeSuffix = data.code ? ` (Twilio code ${data.code})` : '';
      throw new AppError(502, 'TWILIO_DISPATCH_FAILED', `${detail}${codeSuffix}`);
    }

    return {
      providerCallId: data.sid,
      mode: 'LIVE',
      initialStatus: mapTwilioStatus(data.status),
      supportsMute: false,
      transport: 'REST',
    };
  }

  async setMute(_providerCallId: string, muted: boolean): Promise<{ supported: boolean; muted: boolean }> {
    return { supported: false, muted };
  }

  async endCall(providerCallId: string): Promise<void> {
    if (!this.isRestConfigured() || !providerCallId.startsWith('CA')) {
      return;
    }

    const form = new URLSearchParams();
    form.set('Status', 'completed');

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${this.env.TWILIO_ACCOUNT_SID}/Calls/${encodeURIComponent(providerCallId)}.json`;
    await this.fetchFn(endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }).catch(() => {});
  }

  async shutdown(): Promise<void> {}
}
