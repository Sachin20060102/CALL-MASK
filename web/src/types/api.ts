export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export type CallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED'
  | 'BLOCKED';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  defaultCallerIdId: string | null;
  createdAt: string;
}

export interface AccountLimits {
  maxCallDurationSeconds: number;
  dailyCallLimit: number;
  monthlyCallQuota: number;
}

export interface AuthorizedCallerId {
  id: string;
  phoneNumber: string;
  label: string;
  verificationStatus: 'VERIFIED' | 'PENDING' | 'REVOKED';
  isGlobal: boolean;
  isDefault: boolean;
  provider: {
    id: string;
    name: string;
    code: string;
    protocol: 'MOCK' | 'SIP' | 'VOIP_REST';
    enabled: boolean;
  };
}

export interface CallEvent {
  id: string;
  eventType: string;
  status: CallStatus;
  occurredAt: string;
}

export interface CallRecord {
  id: string;
  userId: string;
  callerIdId: string;
  providerId: string;
  callerIdNumber: string;
  destinationNumber: string;
  providerCallId: string | null;
  mode: 'MOCK' | 'LIVE';
  status: CallStatus;
  muted: boolean;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  terminationReason: string | null;
  failureCode: string | null;
  events?: CallEvent[];
}

export interface UsageSummary {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  canceledCalls: number;
  blockedCalls: number;
  activeCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
  todayCalls: number;
  dailyCallLimit: number;
  monthCalls: number;
  monthlyCallQuota: number;
  maxCallDurationSeconds: number;
  telephonyEnabled: boolean;
  telephonyMode: 'mock' | 'live';
}

export interface HealthResponse {
  status: string;
  telephony: {
    enabled: boolean;
    mode: 'mock' | 'live';
    complianceVerified: boolean;
  };
  services: {
    database: string;
    redis: string;
  };
  timestamp: string;
}
