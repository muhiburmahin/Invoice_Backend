/**
 * Routes mounted at `/api/v1/business`.
 * Single source of truth so docs / tests / clients stay in sync.
 */
export const BUSINESS_ROUTES = {
  me: "/",
  currencies: "/currencies",
  preview: "/preview",
} as const;

/**
 * Supported invoice currencies (ISO 4217). The Zod schema validates against
 * this whitelist so we don't accidentally accept "USDD" or "EUO".
 *
 * Order matters — frontend dropdowns will likely render in this order.
 */
export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "GBP", label: "British Pound", symbol: "£" },
  { code: "BDT", label: "Bangladeshi Taka", symbol: "৳" },
  { code: "INR", label: "Indian Rupee", symbol: "₹" },
  { code: "PKR", label: "Pakistani Rupee", symbol: "₨" },
  { code: "AED", label: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", label: "Saudi Riyal", symbol: "﷼" },
  { code: "CAD", label: "Canadian Dollar", symbol: "$" },
  { code: "AUD", label: "Australian Dollar", symbol: "$" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥" },
  { code: "SGD", label: "Singapore Dollar", symbol: "$" },
  { code: "MYR", label: "Malaysian Ringgit", symbol: "RM" },
  { code: "THB", label: "Thai Baht", symbol: "฿" },
  { code: "TRY", label: "Turkish Lira", symbol: "₺" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$" },
  { code: "MXN", label: "Mexican Peso", symbol: "$" },
  { code: "ZAR", label: "South African Rand", symbol: "R" },
  { code: "NGN", label: "Nigerian Naira", symbol: "₦" },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

/** Quick lookup set for Zod validation. */
export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [
  CurrencyCode,
  ...CurrencyCode[],
];

/**
 * Policy / shape limits — used by both Zod and frontend hint UI.
 * Keep numeric limits conservative; loosen later if a real user needs more.
 */
export const BUSINESS_POLICY = {
  name: { min: 1, max: 120 },
  /** Free-form text fields like address, notes, terms. */
  text: { max: 500 },
  longText: { max: 2_000 },
  taxNumber: { max: 60 },
  invoicePrefix: { min: 1, max: 10 },
  /** Highest possible "next number" we'll accept — keeps the int reasonable. */
  nextNumber: { min: 1, max: 9_999_999 },
  defaultDueDays: { min: 0, max: 365 },
  taxRate: { min: 0, max: 100 },
} as const;
