# API modules

Add feature modules here before wiring routes in `src/app/routes/v1/`.

Suggested layout per domain (`invoices`, `clients`, `business`, …):

```
modules/invoices/
  invoice.routes.ts    # Express Router
  invoice.controller.ts
  invoice.service.ts
  invoice.validation.ts
```

Use shared building blocks:

- `validateRequest` + Zod schemas (`src/app/validation/`)
- `paginationQuerySchema` + `buildPaginationMeta`
- `assertWithinPlanLimits` before creates
- `writeAuditLog` for mutations when audit is enabled
- `requirePlan('PRO')` for premium-only endpoints

Mount routers from `src/app/routes/v1/index.ts` under `protectedV1`.
