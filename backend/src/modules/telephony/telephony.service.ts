import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { MockTelephonyAdapter, type MockTelephonyOptions } from './mockTelephony.adapter.js';
import { SipTelephonyAdapter } from './sipTelephony.adapter.js';
import type {
  InitiateOutboundCallRequest,
  InitiateOutboundCallResult,
  ProviderStatusCallback,
  TelephonyAdapter,
} from './telephony.types.js';

export class TelephonyService {
  private readonly mockAdapter: MockTelephonyAdapter;
  private readonly sipAdapter: SipTelephonyAdapter;

  constructor(private readonly env: AppEnv, mockOptions?: MockTelephonyOptions) {
    this.mockAdapter = new MockTelephonyAdapter(mockOptions);
    this.sipAdapter = new SipTelephonyAdapter(env);
  }

  getRuntimeState() {
    const effectiveMode =
      this.env.TELEPHONY_ENABLED &&
      this.env.TELEPHONY_MODE === 'live' &&
      this.env.TELEPHONY_COMPLIANCE_VERIFIED
        ? 'live'
        : 'mock';

    return {
      enabled: this.env.TELEPHONY_ENABLED,
      configuredMode: this.env.TELEPHONY_MODE,
      complianceVerified: this.env.TELEPHONY_COMPLIANCE_VERIFIED,
      effectiveMode,
    };
  }

  private resolveAdapter(protocol: 'MOCK' | 'SIP' | 'VOIP_REST'): TelephonyAdapter {
    if (!this.env.TELEPHONY_ENABLED || this.env.TELEPHONY_MODE === 'mock') {
      return this.mockAdapter;
    }

    if (!this.env.TELEPHONY_COMPLIANCE_VERIFIED) {
      throw new AppError(
        503,
        'TELEPHONY_COMPLIANCE_REQUIRED',
        'Live calling is blocked until TELEPHONY_COMPLIANCE_VERIFIED=true and provider compliance is verified.'
      );
    }

    if (protocol === 'MOCK') {
      return this.mockAdapter;
    }

    return this.sipAdapter;
  }

  async initiateCall(
    req: InitiateOutboundCallRequest,
    callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult> {
    const adapter = this.resolveAdapter(req.provider.protocol);
    return adapter.initiateCall(req, callbacks);
  }

  async setMute(
    mode: 'MOCK' | 'LIVE',
    providerCallId: string,
    muted: boolean
  ): Promise<{ supported: boolean; muted: boolean }> {
    const adapter = mode === 'MOCK' ? this.mockAdapter : this.sipAdapter;
    return adapter.setMute(providerCallId, muted);
  }

  async endCall(mode: 'MOCK' | 'LIVE', providerCallId: string): Promise<void> {
    const adapter = mode === 'MOCK' ? this.mockAdapter : this.sipAdapter;
    await adapter.endCall(providerCallId);
  }

  verifyWebhookSignature(rawPayload: string, signatureHeader: string | undefined): boolean {
    return this.sipAdapter.verifyWebhookSignature(rawPayload, signatureHeader);
  }

  async shutdown(): Promise<void> {
    await Promise.all([this.mockAdapter.shutdown(), this.sipAdapter.shutdown()]);
  }
}
