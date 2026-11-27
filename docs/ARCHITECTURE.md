# MocoCall System Architecture

## 1. Architectural Principles

1. **Zero User Payment Scope**: MocoCall is designed purely as an authorized calling and operational telemetry application. There are no user wallets, balances, credit packages, recharges, user-facing rate calculators, receipts, refunds, or user charges.
2. **Telephony Disabled by Default**: Outbound carrier dispatch is disabled by default (`TELEPHONY_ENABLED=false`, `TELEPHONY_MODE=mock`). All calling workflows operate end-to-end against the deterministic `MockTelephonyAdapter` until a verified VoIP/SIP provider and compliance flags are explicitly enabled.
3. **Strict Caller ID & Destination Governance**: Users can place calls only from verified `authorized_caller_ids` and only to destinations permitted by `destination_restrictions`.
4. **Abuse & Quota Controls Without Monetary Logic**: Resource governance uses duration caps (`maxCallDurationSeconds`), daily/monthly call count limits (`dailyCallLimit`, `monthlyCallQuota`), velocity thresholds, and account suspension rather than balance deductions.
5. **Separated Carrier Telemetry**: Any platform-owner telephony carrier cost estimates (`providerReportedCostMicros`, `providerCurrency`) remain isolated in call/provider operational analytics for administrators and are never exposed as user charges or linked to user accounts as balances.

---

## 2. High-Level Component Diagram

```text
+-------------------+         +-------------------+
|   Web Client      |         |  Android Client   |
| React + TS + Vite |         |    Java + XML     |
+---------+---------+         +---------+---------+
          |                             |
          +--------------+--------------+
                         | HTTPS / REST + SSE
                         v
            +------------+------------+
            |   Backend API Server    |
            |  Node.js + TS + Fastify |
            +---+---------+---------+--+
                |         |         |
       +--------+         |         +------------------+
       v                  v                            v
+------+------+    +------+------+            +--------+---------+
|  MySQL 8.4  |    |   Redis 7   |            | Telephony Engine |
|  via Prisma |    | Quotas/SSE/ |            |  - Mock Adapter  |
+-------------+    | ActiveCalls |            |  - VoIP/SIP Gate |
                   +-------------+            +------------------+
```

---

## 3. Data Model Overview (MySQL 8.4 + Prisma)

### Core Tables

- **`users`**: User identity, hashed passwords, role (`USER`, `ADMIN`), status (`ACTIVE`, `SUSPENDED`), optional per-user overrides (`maxCallDurationSeconds`, `dailyCallLimit`, `monthlyCallQuota`), and `defaultCallerIdId`.
- **`refresh_tokens`**: Hashed refresh tokens with expiration and revocation timestamps.
- **`telephony_providers`**: Configured VoIP/SIP or Mock providers, `enabled` flag, `complianceVerified` flag, SIP domain/endpoint metadata, and health status.
- **`authorized_caller_ids`**: Verified outbound caller ID numbers assigned to a user or marked global/shared, tied to a `telephony_providers` entry and `verificationStatus`.
- **`destination_restrictions`**: `ALLOW` or `BLOCK` rules matching by `PREFIX`, `COUNTRY_CODE`, or `EXACT` number.
- **`call_records`**: Full operational record per call (`userId`, `callerIdId`, `callerIdNumber`, `destinationNumber`, `providerId`, `providerCallId`, `mode`, `status`, `muted`, `startedAt`, `answeredAt`, `endedAt`, `durationSeconds`, `terminationReason`, `failureCode`, and optional admin-only carrier cost telemetry `providerReportedCostMicros` / `providerCurrency`).
- **`call_events`**: Chronological state transition events for every call (`INITIATED`, `RINGING`, `IN_PROGRESS`, `MUTED`, `UNMUTED`, `COMPLETED`, `FAILED`, `CANCELED`, `BLOCKED`).
- **`abuse_reports`**: Abuse and fraud incident queue linked optionally to reporter, target user, and call record.
- **`system_settings`**: Key-value operational policy settings (`maxCallDurationSeconds`, `defaultDailyCallLimit`, `defaultMonthlyCallQuota`, `velocityWindowSeconds`, `velocityMaxCalls`).
- **`audit_logs`**: Immutable administrative and security event log.

---

## 4. Calling Lifecycle & Telephony Safety Gate

1. **Pre-Call Policy Evaluation (`CallsService.initiateCall`)**:
   - Verify user account is `ACTIVE` (not `SUSPENDED`).
   - Validate E.164 destination number format.
   - Check `destination_restrictions` (blocked patterns immediately record a `BLOCKED` call attempt or return `403` and optionally emit an abuse signal).
   - Check authorized caller ID ownership/availability and `VERIFIED` status.
   - Check Redis + DB daily call count and monthly call quota against user override or `system_settings` defaults.
   - Check high-frequency velocity threshold for fraud prevention.
2. **Telephony Dispatch (`TelephonyService`)**:
   - If `TELEPHONY_ENABLED=false` or `TELEPHONY_MODE=mock`, dispatch via `MockTelephonyAdapter`.
   - If `TELEPHONY_MODE=live`, require:
     - `TELEPHONY_ENABLED === true`
     - `TELEPHONY_COMPLIANCE_VERIFIED === true`
     - Selected `TelephonyProvider` row has `enabled === true` and `complianceVerified === true`
     - Otherwise reject safely with `503 TELEPHONY_NOT_VERIFIED`.
3. **Real-Time Call State & Controls**:
   - `MockTelephonyAdapter` transitions calls (`INITIATED` → `RINGING` → `IN_PROGRESS`), supports `mute`/`unmute`, enforces `maxCallDurationSeconds` auto-hangup timer, and cleanly finalizes `endedAt` and `durationSeconds` on `end`.
   - State updates publish to `CallEventsHub` (backed by in-memory event bus + optional Redis pub/sub) and stream to Web and Android clients over SSE (`GET /api/v1/calls/stream`).

---

## 5. Redis Usage

- **Daily & Monthly Call Counters**: Fast atomic checks and increments (`calls:daily:<userId>:<YYYY-MM-DD>`).
- **Velocity / Rate Limiting**: Sliding window counters for login protection and call-burst fraud prevention.
- **Active Call State Cache**: Active call IDs, mute flags, and duration deadlines.
- **Session Revocation**: Access-token JTI / refresh-token revocation list.

In isolated unit/integration tests where no Redis server is running, `RedisStore` seamlessly falls back to an in-memory implementation conforming to the exact same interface.

---

## 6. Security & Compliance Controls

- Passwords hashed with Node `crypto.scrypt` + per-user random salt using constant-time verification.
- Short-lived signed JWT access tokens + rotating hashed refresh tokens.
- Strict Fastify schema/Zod validation on every endpoint.
- Role-based authorization (`USER` vs `ADMIN`).
- Audit logging on user suspensions, quota changes, caller ID provisioning, provider changes, destination restrictions, and abuse resolutions.
