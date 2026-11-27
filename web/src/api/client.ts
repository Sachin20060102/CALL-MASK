import type {
  AccountLimits,
  AuthorizedCallerId,
  CallRecord,
  HealthResponse,
  UsageSummary,
  UserProfile,
} from '../types/api';

export function resolveApiBaseUrl(options?: {
  runtimeBaseUrl?: string;
  envBaseUrl?: string;
  hostname?: string;
}): string {
  const runtimeRaw =
    options?.runtimeBaseUrl ??
    (typeof window !== 'undefined' ? window.__MOCOCALL_CONFIG__?.apiBaseUrl : undefined);
  if (runtimeRaw && runtimeRaw.trim().length > 0) {
    return runtimeRaw.trim().replace(/\/+$/, '');
  }

  const envRaw = options?.envBaseUrl ?? (import.meta.env.VITE_API_BASE_URL as string | undefined);
  if (envRaw && envRaw.trim().length > 0) {
    return envRaw.trim().replace(/\/+$/, '');
  }

  const hostname =
    options?.hostname ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'http://localhost:4000/api/v1';
  }

  return '/api/v1';
}

const API_BASE = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = 'mococall_access_token';
const REFRESH_TOKEN_KEY = 'mococall_refresh_token';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
    return window.localStorage;
  }
  return null;
}

export function getStoredTokens() {
  const storage = getStorage();
  return {
    accessToken: storage ? storage.getItem(ACCESS_TOKEN_KEY) : null,
    refreshToken: storage ? storage.getItem(REFRESH_TOKEN_KEY) : null,
  };
}

export function storeTokens(accessToken: string, refreshToken: string) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, retryRefresh = true): Promise<T> {
  const { accessToken, refreshToken } = getStoredTokens();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && retryRefresh && refreshToken && !path.startsWith('/auth/')) {
    const refRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (refRes.ok) {
      const refData = (await refRes.json()) as { accessToken: string; refreshToken: string };
      storeTokens(refData.accessToken, refData.refreshToken);
      return request<T>(path, init, false);
    }
    clearTokens();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code || 'REQUEST_FAILED', err?.message || 'Request failed');
  }

  return data as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  register: (payload: { email: string; password: string; fullName: string }) =>
    request<{ user: UserProfile; accessToken: string; refreshToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: UserProfile; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: (refreshToken: string) =>
    request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  me: () => request<{ user: UserProfile; limits: AccountLimits }>('/account/me'),

  updateSettings: (payload: {
    fullName?: string;
    defaultCallerIdId?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) =>
    request<{ user: UserProfile }>('/account/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  callerIds: () => request<{ callerIds: AuthorizedCallerId[] }>('/caller-ids'),

  usageSummary: () => request<UsageSummary>('/usage/summary'),

  initiateCall: (payload: {
    callerIdId: string;
    destinationNumber: string;
    transport?: 'AUTO' | 'REST' | 'WEBRTC';
  }) =>
    request<{
      call: CallRecord;
      maxDurationSeconds: number;
      supportsMute: boolean;
      transport?: 'MOCK' | 'REST' | 'WEBRTC' | 'SIP';
    }>('/calls', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  twilioToken: () =>
    request<{ webrtcEnabled: boolean; token?: string; identity?: string }>(
      '/telephony/twilio/token'
    ),

  listCalls: (params: { page?: number; limit?: number; status?: string; search?: string } = {}) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.status) sp.set('status', params.status);
    if (params.search) sp.set('search', params.search);
    const qs = sp.toString();
    return request<{
      items: CallRecord[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/calls${qs ? `?${qs}` : ''}`);
  },

  getCall: (id: string) => request<{ call: CallRecord }>(`/calls/${id}`),

  muteCall: (id: string, muted: boolean) =>
    request<{ call: CallRecord }>(`/calls/${id}/mute`, {
      method: 'POST',
      body: JSON.stringify({ muted }),
    }),

  endCall: (id: string) =>
    request<{ call: CallRecord }>(`/calls/${id}/end`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  subscribeCallStream: (onCallUpdate: (call: CallRecord) => void): (() => void) => {
    const { accessToken } = getStoredTokens();
    if (!accessToken || typeof EventSource === 'undefined') {
      return () => {};
    }
    const source = new EventSource(
      `${API_BASE}/calls/stream?accessToken=${encodeURIComponent(accessToken)}`
    );
    source.addEventListener('call.status', (evt) => {
      try {
        const parsed = JSON.parse((evt as MessageEvent).data) as { call?: CallRecord };
        if (parsed.call) onCallUpdate(parsed.call);
      } catch {
        // Ignore malformed frame
      }
    });
    return () => {
      source.close();
    };
  },

  admin: {
    overview: () => request<any>('/admin/overview'),
    users: () => request<{ users: any[] }>('/admin/users'),
    updateUser: (id: string, payload: Record<string, unknown>) =>
      request<{ user: any }>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    calls: () => request<{ calls: any[] }>('/admin/calls?limit=100'),
    usageAnalytics: () => request<any>('/admin/analytics/usage'),
    providerCosts: () => request<any>('/admin/analytics/provider-costs'),
    callerIds: () => request<{ callerIds: any[] }>('/admin/caller-ids'),
    createCallerId: (payload: Record<string, unknown>) =>
      request<{ callerId: any }>('/admin/caller-ids', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    updateCallerId: (id: string, payload: Record<string, unknown>) =>
      request<{ callerId: any }>(`/admin/caller-ids/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteCallerId: (id: string) =>
      request<{ deleted: boolean }>(`/admin/caller-ids/${id}`, { method: 'DELETE' }),
    providers: () => request<{ runtime: any; providers: any[] }>('/admin/providers'),
    updateProvider: (id: string, payload: Record<string, unknown>) =>
      request<{ provider: any }>(`/admin/providers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    healthCheckProvider: (id: string) =>
      request<{ provider: any }>(`/admin/providers/${id}/health-check`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    restrictions: () => request<{ restrictions: any[] }>('/admin/restrictions'),
    createRestriction: (payload: Record<string, unknown>) =>
      request<{ restriction: any }>('/admin/restrictions', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    deleteRestriction: (id: string) =>
      request<{ deleted: boolean }>(`/admin/restrictions/${id}`, { method: 'DELETE' }),
    abuseReports: () => request<{ reports: any[] }>('/admin/abuse-reports'),
    updateAbuseReport: (id: string, payload: Record<string, unknown>) =>
      request<{ report: any }>(`/admin/abuse-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    settings: () => request<{ settings: Record<string, number> }>('/admin/settings'),
    updateSettings: (payload: Record<string, number>) =>
      request<{ settings: Record<string, number> }>('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    auditLogs: () => request<{ logs: any[] }>('/admin/audit-logs?limit=100'),
  },
};
