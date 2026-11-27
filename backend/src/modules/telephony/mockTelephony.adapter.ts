import crypto from 'node:crypto';
import type {
  InitiateOutboundCallRequest,
  InitiateOutboundCallResult,
  ProviderStatusCallback,
  TelephonyAdapter,
} from './telephony.types.js';

interface ActiveMockCall {
  callRecordId: string;
  providerCallId: string;
  muted: boolean;
  ended: boolean;
  timers: NodeJS.Timeout[];
}

export interface MockTelephonyOptions {
  ringDelayMs?: number;
  answerDelayMs?: number;
}

export class MockTelephonyAdapter implements TelephonyAdapter {
  private readonly activeCalls = new Map<string, ActiveMockCall>();
  private readonly ringDelayMs: number;
  private readonly answerDelayMs: number;

  constructor(options: MockTelephonyOptions = {}) {
    this.ringDelayMs = options.ringDelayMs ?? 350;
    this.answerDelayMs = options.answerDelayMs ?? 900;
  }

  async initiateCall(
    req: InitiateOutboundCallRequest,
    callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult> {
    const providerCallId = `mock_call_${crypto.randomUUID().slice(0, 12)}`;
    const session: ActiveMockCall = {
      callRecordId: req.callRecordId,
      providerCallId,
      muted: false,
      ended: false,
      timers: [],
    };
    this.activeCalls.set(providerCallId, session);

    const isSimulatedFailure = req.destinationNumber === '+15550009999';

    const ringTimer = setTimeout(() => {
      if (session.ended) return;
      void callbacks.onStatusChange(req.callRecordId, 'RINGING');
    }, this.ringDelayMs);
    ringTimer.unref();
    session.timers.push(ringTimer);

    const answerTimer = setTimeout(() => {
      if (session.ended) return;
      if (isSimulatedFailure) {
        this.clearSession(providerCallId);
        void callbacks.onStatusChange(req.callRecordId, 'FAILED', {
          terminationReason: 'Simulated mock carrier unreachable',
          failureCode: 'MOCK_CARRIER_UNREACHABLE',
        });
        return;
      }
      void callbacks.onStatusChange(req.callRecordId, 'IN_PROGRESS');
    }, this.ringDelayMs + this.answerDelayMs);
    answerTimer.unref();
    session.timers.push(answerTimer);

    const maxDurationMs = Math.max(1000, req.maxDurationSeconds * 1000);
    const maxDurationTimer = setTimeout(() => {
      if (session.ended) return;
      this.clearSession(providerCallId);
      void callbacks.onStatusChange(req.callRecordId, 'COMPLETED', {
        terminationReason: 'MAX_DURATION_REACHED',
      });
    }, maxDurationMs);
    maxDurationTimer.unref();
    session.timers.push(maxDurationTimer);

    return {
      providerCallId,
      mode: 'MOCK',
      initialStatus: 'INITIATED',
      supportsMute: true,
      transport: 'MOCK',
    };
  }

  async setMute(providerCallId: string, muted: boolean): Promise<{ supported: boolean; muted: boolean }> {
    const session = this.activeCalls.get(providerCallId);
    if (session && !session.ended) {
      session.muted = muted;
    }
    return { supported: true, muted };
  }

  async endCall(providerCallId: string): Promise<void> {
    this.clearSession(providerCallId);
  }

  async shutdown(): Promise<void> {
    for (const providerCallId of Array.from(this.activeCalls.keys())) {
      this.clearSession(providerCallId);
    }
  }

  private clearSession(providerCallId: string): void {
    const session = this.activeCalls.get(providerCallId);
    if (!session) return;
    session.ended = true;
    for (const timer of session.timers) {
      clearTimeout(timer);
    }
    session.timers = [];
    this.activeCalls.delete(providerCallId);
  }
}
