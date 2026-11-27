# MocoCall API Documentation

Base URL: `/api/v1`

All authenticated routes require `Authorization: Bearer <accessToken>` unless noted otherwise.

> **Scope Note**: MocoCall contains no user payment, wallet, balance, package, recharge, pricing, or refund endpoints.

---

## 1. Health

### `GET /api/v1/health`
Public system health check.

**Response (`200 OK`)**
```json
{
  "status": "ok",
  "telephony": {
    "enabled": false,
    "mode": "mock",
    "complianceVerified": false
  },
  "services": {
    "database": "up",
    "redis": "up"
  },
  "timestamp": "2026-11-27T05:23:00.000Z"
}
```

---

## 2. Authentication & Account

### `POST /api/v1/auth/register`
Create a new user account (`USER` role).

- **Body**: `{ "email": "user@example.com", "password": "Password123!", "fullName": "Alex Rivera" }`
- **Response (`201 Created`)**: `{ "user": {...}, "accessToken": "...", "refreshToken": "..." }`

### `POST /api/v1/auth/login`
Authenticate existing user.

- **Body**: `{ "email": "user@example.com", "password": "Password123!" }`
- **Response (`200 OK`)**: `{ "user": {...}, "accessToken": "...", "refreshToken": "..." }`

### `POST /api/v1/auth/refresh`
Rotate refresh token and issue a new access token.

- **Body**: `{ "refreshToken": "..." }`
- **Response (`200 OK`)**: `{ "accessToken": "...", "refreshToken": "..." }`

### `POST /api/v1/auth/logout`
Revoke refresh token.

- **Body**: `{ "refreshToken": "..." }`
- **Response (`200 OK`)**: `{ "success": true }`

### `GET /api/v1/account/me`
Get current authenticated user profile and effective call limits.

### `PATCH /api/v1/account/settings`
Update `fullName`, `defaultCallerIdId`, or password (`currentPassword`, `newPassword`).

---

## 3. Authorized Caller IDs

### `GET /api/v1/caller-ids`
List active, verified caller IDs available to the authenticated user (user-assigned + global pool).

**Response (`200 OK`)**
```json
{
  "callerIds": [
    {
      "id": "cid_1",
      "phoneNumber": "+14155550101",
      "label": "Operations Desk",
      "verificationStatus": "VERIFIED",
      "isDefault": true,
      "provider": { "id": "prov_mock", "name": "Mock Telephony Sandbox", "protocol": "MOCK" }
    }
  ]
}
```

---

## 4. Calling & Real-Time Status

### `POST /api/v1/calls`
Initiate an outbound call (executes in `mock` mode while `TELEPHONY_ENABLED=false`).

- **Body**: `{ "callerIdId": "cid_1", "destinationNumber": "+12025550144" }`
- **Response (`201 Created`)**:
```json
{
  "call": {
    "id": "call_abc",
    "callerIdNumber": "+14155550101",
    "destinationNumber": "+12025550144",
    "providerCallId": "mock_call_9f12c",
    "mode": "MOCK",
    "status": "INITIATED",
    "muted": false,
    "startedAt": "2026-11-27T05:25:00.000Z",
    "answeredAt": null,
    "endedAt": null,
    "durationSeconds": 0
  },
  "maxDurationSeconds": 1800
}
```

### `GET /api/v1/calls`
List paginated call history for the current user.
- **Query params**: `page`, `limit`, `status`, `search`

### `GET /api/v1/calls/:id`
Retrieve full details and lifecycle `events` for a call owned by the current user (or any call for `ADMIN`).

### `POST /api/v1/calls/:id/mute`
Update mute state for an active call where supported.
- **Body**: `{ "muted": true }`

### `POST /api/v1/calls/:id/end`
Terminate an active call, compute exact duration, and finalize operational usage records.

### `GET /api/v1/calls/stream`
Server-Sent Events (`text/event-stream`) stream delivering real-time `call.status` events for the authenticated user's calls.

---

## 5. Usage Statistics

### `GET /api/v1/usage/summary`
Returns operational call statistics and quota status for the authenticated user.

**Response (`200 OK`)**
```json
{
  "totalCalls": 14,
  "completedCalls": 11,
  "failedCalls": 2,
  "activeCalls": 1,
  "totalDurationSeconds": 1840,
  "averageDurationSeconds": 167,
  "todayCalls": 3,
  "dailyCallLimit": 50,
  "monthCalls": 14,
  "monthlyCallQuota": 500,
  "maxCallDurationSeconds": 1800,
  "telephonyMode": "mock",
  "telephonyEnabled": false
}
```

---

## 6. Telephony Provider Callbacks

### `POST /api/v1/telephony/webhooks/status`
Verified VoIP/SIP provider call status webhook. Rejected unless `TELEPHONY_ENABLED=true`, `TELEPHONY_COMPLIANCE_VERIFIED=true`, and valid `x-telephony-signature` header is supplied.

---

## 7. Admin Endpoints (`ADMIN` role required)

- `GET /api/v1/admin/overview` — System health, telephony gate state, aggregate call KPIs, open abuse counts.
- `GET /api/v1/admin/users` — List users with call counts and operational quotas.
- `PATCH /api/v1/admin/users/:id` — Suspend/activate user, set `maxCallDurationSeconds`, `dailyCallLimit`, `monthlyCallQuota`.
- `GET /api/v1/admin/calls` — System-wide call records.
- `GET /api/v1/admin/analytics/usage` — Operational call volume, completion rate, duration metrics, and status breakdown.
- `GET /api/v1/admin/analytics/provider-costs` — Admin-only carrier operational usage & estimated provider cost summary (strictly separated from user accounts).
- `GET|POST|PATCH|DELETE /api/v1/admin/caller-ids` — Manage authorized caller IDs.
- `GET|POST|PATCH /api/v1/admin/providers` — Manage telephony providers and compliance flags.
- `POST /api/v1/admin/providers/:id/health-check` — Run provider health verification.
- `GET|POST|PATCH|DELETE /api/v1/admin/restrictions` — Manage destination allow/block rules.
- `GET|POST|PATCH /api/v1/admin/abuse-reports` — View, file, and resolve abuse reports.
- `GET|PATCH /api/v1/admin/settings` — Manage global call duration, daily/monthly quotas, and fraud velocity thresholds.
- `GET /api/v1/admin/audit-logs` — Inspect immutable administrative audit log entries.
