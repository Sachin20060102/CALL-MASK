export type TelephonyMode = 'mock' | 'live';
export type CallTransport = 'MOCK' | 'REST' | 'WEBRTC' | 'SIP';

export type CallTransitionStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface InitiateOutboundCallRequest {
  callRecordId: string;
  callerIdNumber: string;
  destinationNumber: string;
  maxDurationSeconds: number;
  requestedTransport?: 'AUTO' | 'REST' | 'WEBRTC';
  provider: {
    id: string;
    code: string;
    protocol: 'MOCK' | 'SIP' | 'VOIP_REST';
    enabled: boolean;
    complianceVerified: boolean;
    sipDomain: string | null;
    endpointUrl: string | null;
  };
}

export interface InitiateOutboundCallResult {
  providerCallId: string;
  mode: 'MOCK' | 'LIVE';
  initialStatus: CallTransitionStatus;
  supportsMute: boolean;
  transport: CallTransport;
}

export interface ProviderStatusCallback {
  onStatusChange: (
    callRecordId: string,
    nextStatus: CallTransitionStatus,
    details?: {
      terminationReason?: string;
      failureCode?: string;
      providerReportedCostMicros?: number;
      providerCurrency?: string;
      durationSecondsOverride?: number;
    }
  ) => Promise<void>;
}

export interface TelephonyAdapter {
  initiateCall(
    req: InitiateOutboundCallRequest,
    callbacks: ProviderStatusCallback
  ): Promise<InitiateOutboundCallResult>;
  setMute(providerCallId: string, muted: boolean): Promise<{ supported: boolean; muted: boolean }>;
  endCall(providerCallId: string): Promise<void>;
  shutdown(): Promise<void>;
}
