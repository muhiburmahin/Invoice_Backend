# Invoice API (SaaS backend)

Express + Prisma + Better Auth backend for a multi-tenant invoice SaaS product.

## Prerequisites

- Node.js 22+
- PostgreSQL (Neon, Docker, or local)
- Optional: Redis (for future job queue), Cloudinary, SMTP, Stripe

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
npm run db:migrate
npm run dev
```

## Environment

Validated on boot via Zod (`src/app/config/env.ts`). See `.env.example`.

Legacy names still work (mapped automatically):

| Legacy | Canonical |
|--------|-----------|
| `FRONTEND_URL`, `APP_URL` | `CLIENT_URL` |
| `EMAIL_SENDER_SMTP_*`, `EMAIL_USER` | `SMTP_*` |

Production requires `BETTER_AUTH_SECRET` (min 32 chars).

## SaaS foundation (before feature APIs)

| Area | Location |
|------|----------|
| Auth (email + OAuth) | `src/app/lib/auth.ts` → `/api/auth` |
| User bootstrap (Business + Subscription) | `bootstrapUser` service + middleware |
| Plan limits | `src/app/constants/plans.ts`, `planUsage.service.ts` |
| Protected API stack | `requireAuth` → `requireActiveUser` → `bootstrapUser` → `assertWorkspace` |
| Billing stubs | `/api/v1/billing/*`, Stripe webhook route |
| Audit log (optional) | `FEATURE_AUDIT_LOG=true` → `auditLog.service.ts` |
| Pagination / validation | `shared/pagination.ts`, `validation/common.schemas.ts` |
| Module layout | `src/app/modules/README.md` |

## API conventions

- Base path: `/api/v1`
- Success: `{ "success": true, "data": { ... }, "meta?": { ... } }`
- Error: `{ "success": false, "message", "code?", "requestId?" }`
- Auth: session cookie from Better Auth (`credentials: true` on frontend)
- Optional header: `X-Workspace-Id` (must match user id until teams exist)

### Useful endpoints today

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/ready` | DB readiness |
| GET | `/api/v1/me` | Current user + subscription + plan limits |
| GET | `/api/v1/billing/subscription` | Subscription record |
| GET | `/api/v1/billing/usage` | Usage vs plan quotas |
| POST | `/api/v1/billing/webhook/stripe` | Stripe webhook (enable `FEATURE_BILLING`) |

## Next: feature modules

Implement under `src/app/modules/` and mount in `src/app/routes/v1/index.ts`:

1. **Business** — profile, logo, invoice numbering  
2. **Clients** — CRUD + `assertWithinPlanLimits(userId, 'clients')`  
3. **Invoices** — CRUD, PDF, send email  
4. **Payments** — record + Stripe  
5. **Recurring** — schedules (PRO+)  
6. **Notifications** — in-app list  

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev server with watch |
| `npm run build` | Typecheck compile |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:seed` | Seed helper |
| `npm run lint` | ESLint |

## Security notes

- Never commit `.env`
- Rotate secrets if exposed
- Set `TRUST_PROXY=true` behind nginx/Render/Fly
- Enable `FEATURE_AUDIT_LOG` in production for compliance
