# MocoCall

MocoCall is a full-stack operational VoIP calling platform built with Node.js, Fastify, TypeScript, Prisma, MySQL 8.4, Redis, React + Vite, and an Android (Java + XML) client.

MocoCall operates strictly without user-facing payments, wallets, credits, recharges, rate calculators, invoices, or user billing. Users authenticate, select an authorized caller ID, place and manage calls under administrative quotas and compliance controls, and review call history and usage statistics. Telephony dispatch is disabled by default (`TELEPHONY_ENABLED=false`) and starts in mock calling mode with full usage tracking until an authorized VoIP/SIP provider and compliance verification are explicitly enabled.

---

## Key Capabilities

### User Features (Web & Android)
- **Authentication & Account Management**: Registration, JWT + refresh token authentication, profile updates, password changes, and active-status enforcement.
- **Dashboard**: Real-time operational summary including total calls, completed/failed counts, total & average call duration, daily/monthly quota utilization, and telephony mode status (`MOCK` vs `LIVE`).
- **Authorized Caller ID Selection**: Users choose only from verified, active, authorized caller IDs assigned to them or the verified organization pool.
- **Calling & Live Controls**: Enter E.164 destination numbers, initiate calls, receive real-time call status updates (`INITIATED` → `RINGING` → `IN_PROGRESS` → `COMPLETED` / `FAILED`), mute/unmute active calls where supported, and end calls.
- **Call History & Usage Statistics**: Filterable call logs with provider call IDs, start/end timestamps, duration, call lifecycle events, and aggregate usage metrics.

### Administrative & Compliance Controls
- **Telephony Disabled by Default**: `TELEPHONY_ENABLED=false` and `TELEPHONY_MODE=mock` by default. Live VoIP/SIP dispatch is gated behind explicit provider verification and compliance approval (`TELEPHONY_COMPLIANCE_VERIFIED=true`).
- **Usage & Abuse Controls**: Configurable maximum call duration, daily call limits, monthly user quotas, destination number restrictions (`BLOCK` / `ALLOW` by prefix, country code, or exact match), velocity-based fraud detection, abuse reporting, and instant account suspension.
- **Admin Console**: User management, global call records, usage analytics, authorized caller ID provisioning, telephony provider health checks, destination restrictions, abuse report triage, and immutable audit logs.
- **Separated Provider Operational Cost Reporting**: Platform-owner telephony carrier usage and estimated carrier cost summaries are isolated exclusively in admin provider telemetry and never create user balances, charges, or payment requirements.

---

## Technology Stack

| Layer | Technology |
| --- | --- |
| **Web Frontend** | React 19, TypeScript, Vite |
| **Android App** | Java, XML Layouts, Material Components, Retrofit 2, OkHttp 3 |
| **Backend API** | Node.js, TypeScript, Fastify |
| **Database & ORM** | MySQL 8.4, Prisma ORM |
| **Cache & Real-Time** | Redis 7, Server-Sent Events (SSE) |
| **Telephony** | Authorized VoIP / SIP Provider Adapter (`mock` default) |
| **Infrastructure & CI** | Docker Compose, GitHub Actions |

---

## Repository Structure

```text
.
├── backend/                 # Fastify + TypeScript + Prisma + Redis API server
│   ├── prisma/              # MySQL 8.4 schema, SQL migrations, seed script
│   ├── src/                 # Modular routes, services, telephony adapters, plugins
│   └── tests/               # Unit and integration tests (Vitest)
├── web/                     # React + TypeScript + Vite web application
├── android/                 # Native Android application (Java + XML)
├── docs/                    # Architecture, API reference, and progress tracker
├── scripts/                 # Repository compliance verification scripts
├── docker-compose.yml       # MySQL 8.4, Redis 7, Backend, and Web containers
└── .env.example             # Environment configuration (no payment keys required)
```

---

## Quick Start

### 1. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Notice that no payment gateway keys or provider credentials are required. Telephony remains safely disabled (`TELEPHONY_ENABLED=false`, `TELEPHONY_MODE=mock`) out of the box.

### 2. Run with Docker Compose

```bash
docker compose up --build
```

Services started:
- **MySQL 8.4**: `localhost:3306`
- **Redis 7**: `localhost:6379`
- **Backend API**: `http://localhost:4000`
- **Web App**: `http://localhost:5173` (or `8080` in nginx container; mapped in `docker-compose.yml`)

### 3. Run Locally (Development)

#### Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

#### Web

```bash
cd web
npm install
npm run dev
```

#### Android

Open `android/` in Android Studio or run Gradle from `android/`:

```bash
cd android
./gradlew testDebugUnitTest assembleDebug
```

When testing against the local backend from an Android emulator, the default debug `API_BASE_URL` uses `http://10.0.2.2:4000/api/v1/`.

### 4. Production Static Hosting (Hostinger / Apache / Nginx)

- **SPA Routing**: `web/public/.htaccess` is bundled into `web/dist/.htaccess` for Apache/LiteSpeed hosting so routes like `/login`, `/register`, and `/dialer` resolve to `index.html` instead of returning `404`.
- **API URL Configuration**: On non-localhost domains, the web client defaults to same-origin `/api/v1` (avoiding browser loopback blocks). To point to a separate backend origin without rebuilding, set `apiBaseUrl` in `web/dist/config.js`, or build with `VITE_API_BASE_URL=https://api.example.com/api/v1 npm run build`.
- **Backend CORS**: Set `CORS_ORIGIN` in `backend/.env` to a comma-separated list of allowed origins (for example `https://maskcall.example.com`).

### 5. Deploying the Backend to Render

A Render Blueprint is included in [render.yaml](render.yaml):

- **Root Directory**: `backend`
- **Build Command**: `npm install --include=dev && npm run build:full`
- **Start Command**: `npx prisma migrate deploy && node dist/server.js`
- **Health Check Path**: `/api/v1/health`
- **Required Env Vars**: `DATABASE_URL` (MySQL 8.4 connection string with `@` encoded as `%40`), `CORS_ORIGIN` (your frontend origin), and optional `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` to create an initial admin user on boot.

### 6. Enabling Live Outbound Calling with Twilio (Optional)

Telephony stays disabled by default (`TELEPHONY_ENABLED=false`, `TELEPHONY_MODE=mock`). Once you have verified compliance and a Twilio account (including a Twilio Free Trial for calling OTP-verified numbers):

1. Set `TELEPHONY_ENABLED=true`, `TELEPHONY_MODE=live`, and `TELEPHONY_COMPLIANCE_VERIFIED=true`.
2. Set `PUBLIC_API_BASE_URL` (e.g., `https://call-mask.onrender.com`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_CALLER_ID` (your Twilio phone number in E.164 format). On startup, MocoCall provisions the verified `twilio-voice` provider and `TWILIO_CALLER_ID`.
3. *(Optional, for two-way browser microphone audio)* Also set `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, and `TWILIO_TWIML_APP_SID` pointing the TwiML App Voice URL to `POST <PUBLIC_API_BASE_URL>/api/v1/telephony/webhooks/twilio/voice`.

---

## Verification & Testing

Run tests and builds across all modules:

```bash
# Backend unit + integration tests & build
cd backend && npm run typecheck && npm test && npm run build

# Web unit tests, typecheck & production bundle
cd web && npm run typecheck && npm test && npm run build

# Android unit tests & debug APK
cd android && ./gradlew testDebugUnitTest assembleDebug

# Spec compliance verification (ensures zero user payment/wallet/billing artifacts)
node scripts/verify-no-payment-spec.mjs
```

---

## Documentation

- [Architecture Specification](docs/ARCHITECTURE.md)
- [REST & Real-Time API Documentation](docs/API.md)
- [Project Progress Tracker](docs/PROGRESS.md)
