import crypto from 'node:crypto';
import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type {
  InitiateOutboundCallRequest,
  InitiateOutboundCallResult,
  ProviderStatusCallback,
  TelephonyAdapter,
} from './telephony.types.js';

/**
 * Authorized VoIP / SIP provider adapter skeleton.
 * Real outbound carrier dispatch remains strictly disabled until
 * TELEPHONY_ENABLED=true, TELEPHONY_COMPLIANCE_VERIFIED=true,
 * and an enabled, compliance-verified SIP/VoIP provider is configured.
 */
export class SipTelephonyAdapter implements TelephonyAdapter {
  constructor(private readonly env: AppEnv) {}

  async initiateCall(
    req: InitiateOutboundCallRequest,
    _callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult> {
    if (!this.env.TELEPHONY_ENABLED || !this.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      throw new AppError(
        503,
        'TELEPHONY_DISABLED',
        'Live VoIP/SIP telephony is disabled until compliance verification is complete.'
      );
    }

    if (!req.provider.enabled || !req.provider.complianceVerified) {
      throw new AppError(
        503,
        'PROVIDER_NOT_VERIFIED',
        'Selected telephony provider is not enabled and compliance-verified.'
      );
    }

    if (!req.provider.sipDomain && !req.provider.endpointUrl) {
      throw new AppError(
        503,
        'PROVIDER_NOT_CONFIGURED',
        'Telephony provider SIP domain or REST endpoint is not configured.'
      );
    }

    throw new AppError(
      501,
      'LIVE_PROVIDER_DISPATCH_NOT_IMPLEMENTED',
      'Live VoIP/SIP trunk transport requires carrier credentials and final compliance sign-off.'
    );
  }

  async setMute(_providerCallId: string, muted: boolean): Promise<{ supported: boolean; muted: boolean }> {
    return { supported: false, muted };
  }

  async endCall(_providerCallId: string): Promise<void> {
    // Live SIP BYE / carrier hangup hook goes here once live trunking is provisioned
  }

  async shutdown(): Promise<void> {
    // Cleanup live SIP client resources if any
  }

  verifyWebhookSignature(rawPayload: string, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const expected = crypto
      .createHmac('sha256', this.env.TELEPHONY_WEBHOOK_SECRET)
      .update(rawPayload)
      .digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader.trim(), 'utf8');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}
