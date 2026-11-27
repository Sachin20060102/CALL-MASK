# MocoCall Project Progress Tracker

**Specification Version**: 2.0 (Zero-Billing / Operational Calling Edition)
**Last Updated**: 2026-11-27

## Milestone Status

| Module | Status | Notes |
| --- | --- | --- |
| Project Spec & Architecture | Complete | Zero user payment, wallet, credit, recharge, pricing, or refund logic |
| Database Schema (MySQL 8.4 + Prisma) | Complete | Core operational tables only (`users`, `call_records`, `authorized_caller_ids`, `telephony_providers`, `destination_restrictions`, `abuse_reports`, `system_settings`, `audit_logs`) |
| Backend API (Node.js + TS + Fastify) | Complete | Auth, Caller IDs, Calls, SSE Stream, Usage Stats, Admin Dashboard, Mock Telephony default |
| Telephony Compliance Gate | Complete | `TELEPHONY_ENABLED=false` by default; `MockTelephonyAdapter` active until provider & compliance verified |
| Web Frontend (React + TS + Vite) | Complete | Login, Register, Dashboard, Dialer, Call History, Usage Stats, Settings, Admin Console |
| Android App (Java + XML) | Complete | Login, Register, Dashboard, Dialer + Live Controls, Call History, Settings |
| Docker Compose & Environment | Complete | MySQL 8.4, Redis 7, Backend, Web; zero payment env vars |
| CI & Automated Spec Verification | Complete | GitHub Actions workflow + `scripts/verify-no-payment-spec.mjs` |

## Removed Obsolete Scope Verification

- [x] No `wallet_accounts`, `wallet_transactions`, `payment_orders`, or `pricing_rules` tables
- [x] No `/payments/*`, `/wallet/*`, or `/pricing/*` API routes or payment webhooks
- [x] No payment gateway SDKs or environment variables
- [x] No payment/recharge/wallet/rate-calculator UI screens or buttons in Web or Android
- [x] Provider-side carrier operational cost metrics isolated strictly to admin provider analytics
- [x] Telephony disabled by default (`TELEPHONY_ENABLED=false`), starting with deterministic mock calling
