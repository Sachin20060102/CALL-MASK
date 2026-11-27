import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { MockTelephonyAdapter, type MockTelephonyOptions } from './mockTelephony.adapter.js';
import { SipTelephonyAdapter } from './sipTelephony.adapter.js';
import { TwilioTelephonyAdapter } from './twilioTelephony.adapter.js';
import type {
  InitiateOutboundCallRequest,
  InitiateOutboundCallResult,
  ProviderStatusCallback,
  TelephonyAdapter,
} from './telephony.types.js';

export class TelephonyService {
  private readonly mockAdapter: MockTelephonyAdapter;
  private readonly sipAdapter: SipTelephonyAdapter;
  private readonly twilioAdapter: TwilioTelephonyAdapter;

  constructor(
    private readonly env: AppEnv,
    mockOptions?: MockTelephonyOptions,
    fetchImpl?: typeof fetch
  ) {
    this.mockAdapter = new MockTelephonyAdapter(mockOptions);
    this.sipAdapter = new SipTelephonyAdapter(env);
    this.twilioAdapter = new TwilioTelephonyAdapter(env, fetchImpl);
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
      twilioConfigured: this.twilioAdapter.isRestConfigured(),
      twilioWebRtcConfigured: this.twilioAdapter.isWebRtcConfigured(),
    };
  }

  private resolveAdapter(
    protocol: 'MOCK' | 'SIP' | 'VOIP_REST',
    providerCode?: string
  ): TelephonyAdapter {
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

    if (protocol === 'VOIP_REST' || providerCode?.startsWith('twilio')) {
      return this.twilioAdapter;
    }

    return this.sipAdapter;
  }

  async initiateCall(
    req: InitiateOutboundCallRequest,
    callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult> {
    const adapter = this.resolveAdapter(req.provider.protocol, req.provider.code);
    return adapter.initiateCall(req, callbacks);
  }

  async setMute(
    mode: 'MOCK' | 'LIVE',
    providerCallId: string,
    muted: boolean,
    protocol: 'MOCK' | 'SIP' | 'VOIP_REST' = 'MOCK'
  ): Promise<{ supported: boolean; muted: boolean }> {
    if (mode === 'MOCK') {
      return this.mockAdapter.setMute(providerCallId, muted);
    }
    const adapter = protocol === 'VOIP_REST' ? this.twilioAdapter : this.sipAdapter;
    return adapter.setMute(providerCallId, muted);
  }

  async endCall(
    mode: 'MOCK' | 'LIVE',
    providerCallId: string,
    protocol: 'MOCK' | 'SIP' | 'VOIP_REST' = 'MOCK'
  ): Promise<void> {
    if (mode === 'MOCK') {
      await this.mockAdapter.endCall(providerCallId);
      return;
    }
    const adapter = protocol === 'VOIP_REST' ? this.twilioAdapter : this.sipAdapter;
    await adapter.endCall(providerCallId);
  }

  verifyWebhookSignature(rawPayload: string, signatureHeader: string | undefined): boolean {
    return this.sipAdapter.verifyWebhookSignature(rawPayload, signatureHeader);
  }

  getTwilioAdapter(): TwilioTelephonyAdapter {
    return this.twilioAdapter;
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.mockAdapter.shutdown(),
      this.sipAdapter.shutdown(),
      this.twilioAdapter.shutdown(),
    ]);
  }
}
