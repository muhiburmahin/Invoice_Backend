import { CURRENCY_CODES } from "../business/business.constants";

/** Routes mounted at `/api/v1/clients`. */
export const CLIENT_ROUTES = {
  list: "/",
  stats: "/stats",
  byId: "/:id",
  status: "/:id/status",
  restore: "/:id/restore",
  regeneratePortalToken: "/:id/portal-token/regenerate",
} as const;

export { CURRENCY_CODES };

/** Field limits — shared by Zod and frontend hint UI. */
export const CLIENT_POLICY = {
  name: { min: 1, max: 120 },
  email: { max: 254 },
  company: { max: 120 },
  phone: { max: 25 },
  address: { max: 500 },
  location: { max: 120 },
  taxNumber: { max: 60 },
  notes: { max: 2_000 },
  tags: { maxCount: 10, maxLength: 30 },
} as const;

/** Safe fields returned in list responses (no portalToken). */
export const CLIENT_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  company: true,
  phone: true,
  city: true,
  country: true,
  currency: true,
  tags: true,
  portalEnabled: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
