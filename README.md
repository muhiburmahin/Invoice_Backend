# Invoice API (SaaS backend)

Express + Prisma + Better Auth backend for a multi-tenant invoice SaaS product.

## Prerequisites

- Node.js 22+
- PostgreSQL (Neon, Docker, or local)
- Optional: Redis (BullMQ background jobs), Cloudinary, SMTP, Stripe

## Quick start

```bash
cp .env.example .env
# Edit DATABASE_URL, BETTER_AUTH_SECRET, CLIENT_URL

npm install
npm run db:migrate
npm run dev
```

API: `http://localhost:5000`  
Auth: `http://localhost:5000/api/auth`  
Health: `http://localhost:5000/health/ready`

## Docker (local DB + Redis)

```bash
npm run docker:up
# Set DATABASE_URL=postgresql://invoice:invoice@localhost:5432/invoice
# Set REDIS_URL=redis://localhost:6379
npm run db:migrate
npm run dev
# In another terminal (when FEATURE_SCHEDULED_JOBS=true):
npm run worker
```

## Environment

Validated on boot via Zod (`src/app/config/env.ts`). See `.env.example`.

| Legacy | Canonical |
|--------|-----------|
| `FRONTEND_URL`, `APP_URL` | `CLIENT_URL` |
| `EMAIL_SENDER_SMTP_*`, `EMAIL_USER` | `SMTP_*` |

Production requires `BETTER_AUTH_SECRET` (min 32 chars).

### Feature flags

| Variable | Description |
|----------|-------------|
| `FEATURE_BILLING` | Stripe invoice payments + SaaS subscription checkout |
| `FEATURE_AUDIT_LOG` | Persist admin activity logs |
| `FEATURE_SCHEDULED_JOBS` | Overdue invoices, subscription reminders, recurring auto-run |
| `REDIS_URL` | Required for BullMQ when scheduled jobs are enabled |
| `SCHEDULED_JOBS_INTERVAL_MS` | Repeat interval for background jobs (default 1h) |

### Stripe (billing)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `STRIPE_PRICE_PRO_MONTHLY` | Price ID for PRO plan |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | Price ID for ENTERPRISE plan |

## Architecture

| Area | Location |
|------|----------|
| Auth (email + OAuth) | `src/app/lib/auth.ts` → `/api/auth` |
| User bootstrap | Business + FREE subscription on first login |
| Plan limits | `src/app/constants/plans.ts`, `planUsage.service.ts` |
| Invoice Stripe pay | `stripeCheckout.service.ts` |
| SaaS subscription billing | `stripeSubscription.service.ts` |
| Background jobs | `src/app/services/jobs/`, `src/worker.ts` |
| Modules | `src/app/modules/` |

## API conventions

- Base path: `/api/v1`
- Success: `{ "success": true, "data": { ... }, "meta?": { ... } }`
- Error: `{ "success": false, "message", "code?", "requestId?" }`
- Auth: session cookie from Better Auth

### Core endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/ready` | DB readiness |
| GET | `/api/v1/me` | User + subscription + plan limits + unread notifications |
| GET | `/api/v1/billing/meta` | Billing capabilities (Stripe, prices) |
| GET | `/api/v1/billing/subscription` | Current subscription |
| GET | `/api/v1/billing/usage` | Usage vs plan quotas |
| POST | `/api/v1/billing/checkout` | SaaS plan upgrade (PRO/ENTERPRISE) |
| POST | `/api/v1/billing/portal` | Stripe Customer Portal |
| POST | `/api/v1/billing/webhook/stripe` | Stripe webhooks (raw body) |
| GET | `/api/v1/notifications` | In-app notifications |
| POST | `/api/v1/admin/jobs/run` | Trigger background jobs (SUPER_ADMIN) |

Product modules: `business`, `clients`, `invoices`, `payments`, `recurring-schedules`, `notifications`, `portal`, `admin`.

## Background jobs

When `FEATURE_SCHEDULED_JOBS=true`:

- **Without Redis** — jobs run in-process on the API server (`setInterval`)
- **With Redis** — run `npm run worker` to process BullMQ jobs

Jobs:

1. **overdue** — mark past-due invoices + notify
2. **subscription_expiry** — warn before plan period ends
3. **recurring** — auto-generate due recurring invoices

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev API server |
| `npm run worker` | BullMQ worker (requires Redis) |
| `npm run build` | Typecheck compile |
| `npm run db:migrate` | Prisma migrate |
| `npm run docker:up` | Postgres + Redis via Docker |

## Security notes

- Never commit `.env`
- Set `TRUST_PROXY=true` behind nginx/Render/Fly
- Enable `FEATURE_AUDIT_LOG` in production for compliance
- Configure Stripe webhook for: `checkout.session.*`, `customer.subscription.*`
