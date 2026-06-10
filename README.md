# Invoice API (SaaS Backend)

Express + Prisma + Better Auth backend for a multi-tenant invoice SaaS product.

**Live API:** `https://invoice-backend-red-nine.vercel.app`

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ (ESM) |
| Framework | Express 5 |
| Database | PostgreSQL + Prisma 7 |
| Auth | Better Auth (email/password, Google, GitHub) |
| Payments | Stripe (optional) |
| Jobs | BullMQ + Redis (optional) |
| Deploy | Vercel (esbuild bundle → `dist/app.mjs`) |

---

## Prerequisites

- Node.js 20+
- PostgreSQL (Neon, Docker, or local)
- [Invoice Frontend](https://github.com/muhiburmahin/Invoice-Frontend) (Next.js) for the web app
- Optional: Redis, Cloudinary, SMTP, Stripe

---

## Quick start (local)

```bash
git clone <your-backend-repo-url>
cd invoice-backend

cp .env.example .env
# Edit DATABASE_URL, BETTER_AUTH_SECRET, CLIENT_URL

npm install
npm run db:migrate
npm run dev
```

| Service | URL |
|---------|-----|
| API root | `http://localhost:5000` |
| Better Auth | `http://localhost:5000/api/auth` |
| Health check | `http://localhost:5000/health/ready` |
| API v1 | `http://localhost:5000/api/v1` |

---

## Environment variables

Copy `.env.example` → `.env`. Variables are validated on boot via Zod (`src/app/config/env.ts`).

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Min 32 characters (required in production) |
| `CLIENT_URL` | Public frontend URL (`http://localhost:3000` in dev) |
| `BETTER_AUTH_URL` | URL where `/api/auth` is reachable — **use frontend origin** (Next.js proxies auth) |

### Auth & OAuth

| Variable | Description |
|----------|-------------|
| `APP_URL` / `FRONTEND_URL` | Aliases for `CLIENT_URL` |
| `PROD_APP_URL` | Production frontend domain (CORS) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `TRUST_PROXY` | Set `true` behind Vercel / reverse proxy |

### Google OAuth redirect URI

Always use the **frontend** URL (not the backend):

```
http://localhost:3000/api/auth/callback/google          # local
https://your-frontend.vercel.app/api/auth/callback/google   # production
```

### Optional integrations

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | BullMQ background jobs |
| `SMTP_*` / `EMAIL_*` | Transactional email |
| `CLOUDINARY_*` | Logo / file uploads |
| `STRIPE_*` | Billing & webhooks |
| `SUPER_ADMIN_EMAIL` | Bootstrap super admin on `npm run db:seed` |

### Feature flags

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_BILLING` | `false` | Stripe checkout & subscriptions |
| `FEATURE_AUDIT_LOG` | `false` | Admin activity logs |
| `FEATURE_SCHEDULED_JOBS` | `false` | Overdue invoices, recurring, reminders |
| `FEATURE_OFFLINE_BILLING` | `false` | Manual bKash / bank transfer upgrades |

---

## Frontend integration

The Next.js frontend proxies API requests:

```
Browser  →  frontend.com/api/*  →  backend.com/api/*
Browser  →  frontend.com/api/auth/*  →  backend.com/api/auth/*
```

**Local `.env` (backend):**

```env
CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
```

**Production (Vercel backend env):**

```env
NODE_ENV=production
TRUST_PROXY=true
CLIENT_URL=https://invoice-kohl-one.vercel.app
BETTER_AUTH_URL=https://invoice-kohl-one.vercel.app
PROD_APP_URL=https://invoice-kohl-one.vercel.app
CORS_ORIGINS=https://invoice-kohl-one.vercel.app,https://invoice-backend-red-nine.vercel.app
```

CORS allows all `*.vercel.app` preview deployments automatically (`src/app/lib/cors.ts`).

---

## Deploy to Vercel

```bash
cd invoice-backend
vercel --prod
```

### Build output

| File | Purpose |
|------|---------|
| `src/createApp.ts` | Express app factory (dev + bundle entry) |
| `src/server.ts` | Local dev server (`npm run dev`) |
| `scripts/build.mjs` | esbuild → `dist/app.mjs` |
| `vercel.json` | `buildCommand: npm run build` |

> Vercel must **not** use unbundled `src/app.ts` — the esbuild bundle avoids ESM/CJS and Prisma runtime issues.

### Vercel environment variables (minimum)

```
DATABASE_URL
NODE_ENV=production
BETTER_AUTH_SECRET
BETTER_AUTH_URL          # frontend URL
CLIENT_URL               # frontend URL
PROD_APP_URL             # frontend URL
TRUST_PROXY=true
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

After changing env vars → **Redeploy** from Vercel Dashboard.

---

## Docker (local DB + Redis)

```bash
npm run docker:up
# DATABASE_URL=postgresql://invoice:invoice@localhost:5432/invoice
# REDIS_URL=redis://localhost:6379

npm run db:migrate
npm run dev

# Separate terminal (when FEATURE_SCHEDULED_JOBS=true + Redis):
npm run worker
```

---

## API overview

### Conventions

- Base path: `/api/v1`
- Success: `{ "success": true, "data": { ... }, "meta?": { ... } }`
- Error: `{ "success": false, "message", "code?", "requestId?" }`
- Auth: Better Auth session cookie (`better-auth.session_token`)

### Core endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | — | API info |
| GET | `/health/ready` | — | DB readiness |
| ALL | `/api/auth/*` | — | Better Auth (login, OAuth, session) |
| GET | `/api/v1/auth/config` | — | OAuth provider flags |
| POST | `/api/v1/auth/login` | — | Email login |
| POST | `/api/v1/auth/register` | — | Register |
| GET | `/api/v1/me` | ✓ | User + subscription + plan limits |
| GET | `/api/v1/billing/meta` | ✓ | Stripe capabilities |
| POST | `/api/v1/billing/checkout` | ✓ | SaaS plan upgrade |
| POST | `/api/v1/billing/webhook/stripe` | — | Stripe webhooks (raw body) |
| GET | `/api/v1/notifications` | ✓ | In-app notifications |

### Product modules

| Module | Path prefix |
|--------|-------------|
| Business | `/api/v1/business` |
| Clients | `/api/v1/clients` |
| Invoices | `/api/v1/invoices` |
| Payments | `/api/v1/payments` |
| Recurring | `/api/v1/recurring-schedules` |
| Notifications | `/api/v1/notifications` |
| Billing | `/api/v1/billing` |
| Admin | `/api/v1/admin` |
| Client portal | `/api/v1/portal` |
| Marketing | `/api/v1/public/marketing` |

---

## Project structure

```
invoice-backend/
├── prisma/                 # Schema, migrations, seed
├── scripts/build.mjs       # Vercel production bundle
├── src/
│   ├── createApp.ts        # Express app (Vercel entry)
│   ├── server.ts           # Local dev server
│   └── app/
│       ├── config/         # Env validation (Zod)
│       ├── lib/
│       │   ├── auth.ts     # Better Auth config
│       │   └── cors.ts     # CORS + Vercel origins
│       ├── middlewares/    # Auth, workspace, errors
│       ├── modules/        # Feature modules
│       ├── routes/         # Route composition
│       └── services/       # Billing, email, jobs, PDF
├── dist/app.mjs            # Production bundle (generated)
├── vercel.json
└── .env.example
```

---

## Background jobs

Enable with `FEATURE_SCHEDULED_JOBS=true`.

| Mode | How |
|------|-----|
| No Redis | In-process `setInterval` on API server |
| With Redis | Run `npm run worker` (BullMQ) |

Jobs: overdue invoices, subscription expiry warnings, recurring invoice generation.

---

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Dev API server with hot reload |
| `npm run start` | Start API server |
| `npm run build` | `prisma generate` + esbuild → `dist/app.mjs` |
| `npm run build:types` | TypeScript check only |
| `npm run worker` | BullMQ worker (needs Redis) |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:push` | Push schema without migration |
| `npm run db:seed` | Seed super admin + demo data |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run docker:up` | Start Postgres + Redis containers |
| `npm run lint` | ESLint |

---

## Roles

| Role | Access |
|------|--------|
| `USER` | Business dashboard — clients, invoices, payments |
| `SUPPORT` | Admin panel (limited) |
| `SUPER_ADMIN` | Full admin — users, logs, jobs |

---

## Security notes

- Never commit `.env` or secrets
- Set `TRUST_PROXY=true` on Vercel / behind nginx
- `BETTER_AUTH_URL` must be the **frontend** origin (not backend)
- Production cookies use `__Secure-` prefix (HTTPS only)
- Enable `FEATURE_AUDIT_LOG` in production for compliance
- Configure Stripe webhooks: `checkout.session.*`, `customer.subscription.*`

---

## License

ISC
