/** Static marketing copy for features page — merged with live stats/plans in the service. */

export const FEATURE_CATEGORIES = [
  {
    id: "invoicing",
    label: "Invoicing",
    description: "Create, send, and track professional invoices.",
  },
  {
    id: "clients",
    label: "Clients & portal",
    description: "Manage clients and give them a secure self-service portal.",
  },
  {
    id: "payments",
    label: "Payments",
    description: "Get paid faster with Stripe and manual payment tracking.",
  },
  {
    id: "automation",
    label: "Automation",
    description: "Recurring billing, reminders, and overdue visibility.",
  },
  {
    id: "branding",
    label: "Branding & scale",
    description: "Your brand on every touchpoint — local or international.",
  },
] as const;

export type FeatureCategoryId = (typeof FEATURE_CATEGORIES)[number]["id"];

export const MARKETING_FEATURES = [
  {
    id: "fast-invoicing",
    title: "Fast invoicing & PDF",
    description:
      "Line items, tax, discounts, and notes on polished templates. Export PDF in one click.",
    category: "invoicing" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Draft & sent statuses", "Invoice numbering", "PDF export"],
  },
  {
    id: "invoice-dashboard",
    title: "Invoice dashboard",
    description:
      "See outstanding, paid, and overdue totals at a glance. Filter and search every invoice.",
    category: "invoicing" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Status filters", "Balance due", "Activity timeline"],
  },
  {
    id: "client-management",
    title: "Client management",
    description:
      "Store contacts, billing details, and notes. Attach clients to invoices in seconds.",
    category: "clients" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Client list & search", "Billing profiles", "Portal tokens"],
  },
  {
    id: "client-portal",
    title: "Client portal",
    description:
      "Share a secure link — clients view, download, and pay without creating an account.",
    category: "clients" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Magic-link access", "View & download PDF", "Pay online"],
  },
  {
    id: "stripe-checkout",
    title: "Stripe checkout",
    description:
      "Send card checkout links from invoices or the portal. Payments sync to invoice balance.",
    category: "payments" as const,
    plans: ["PRO", "ENTERPRISE"] as const,
    highlights: ["Hosted checkout", "Partial payments", "Webhook sync"],
  },
  {
    id: "payment-tracking",
    title: "Payment tracking",
    description:
      "Record bank transfers, mark partial payments, and always know what's still due.",
    category: "payments" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Payment history", "Multiple methods", "Balance updates"],
  },
  {
    id: "recurring",
    title: "Recurring invoices",
    description:
      "Weekly, monthly, or quarterly schedules for retainers and subscriptions.",
    category: "automation" as const,
    plans: ["PRO", "ENTERPRISE"] as const,
    highlights: ["Flexible cadence", "Auto-generate drafts", "Pause & resume"],
  },
  {
    id: "reminders",
    title: "Reminders & overdue",
    description:
      "Spot late invoices instantly and send reminders before cash flow slips.",
    category: "automation" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Overdue badges", "Due date tracking", "Notification hooks"],
  },
  {
    id: "notifications",
    title: "In-app notifications",
    description:
      "Payment received, invoice viewed, and overdue alerts in one inbox.",
    category: "automation" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Real-time feed", "Read / unread", "Deep links"],
  },
  {
    id: "branding",
    title: "Custom branding",
    description:
      "Your logo and brand colors on invoices and the client portal.",
    category: "branding" as const,
    plans: ["PRO", "ENTERPRISE"] as const,
    highlights: ["Logo upload", "Brand colors", "Portal theming"],
  },
  {
    id: "multi-currency",
    title: "Multi-currency",
    description:
      "Invoice in the currency your client expects — USD, EUR, GBP, and more.",
    category: "branding" as const,
    plans: ["FREE", "PRO", "ENTERPRISE"] as const,
    highlights: ["Per-invoice currency", "Formatted totals", "PDF display"],
  },
  {
    id: "team-scale",
    title: "Enterprise & priority support",
    description:
      "Unlimited volume, dedicated onboarding, and priority support for growing teams.",
    category: "branding" as const,
    plans: ["ENTERPRISE"] as const,
    highlights: ["Unlimited quotas", "Priority support", "Custom contracts"],
  },
] as const;

export const FEATURE_COMPARISON_ROWS = [
  { id: "clients", label: "Clients" },
  { id: "invoices", label: "Invoices / month" },
  { id: "recurring", label: "Recurring schedules" },
  { id: "pdf", label: "PDF export" },
  { id: "portal", label: "Client portal" },
  { id: "stripe", label: "Stripe payments" },
  { id: "branding", label: "Custom branding" },
  { id: "support", label: "Priority support" },
] as const;

export const FEATURES_FAQ = [
  {
    q: "Which features are on the Free plan?",
    a: "Free includes core invoicing, PDF export, client portal, payment tracking, and up to 10 clients with 5 invoices per month.",
    category: "plans",
  },
  {
    q: "Do I need Stripe to use Invoice?",
    a: "No. You can record bank transfers manually. Stripe is optional on Pro and Enterprise for card checkout.",
    category: "billing",
  },
  {
    q: "Can clients pay without signing up?",
    a: "Yes. The client portal uses a secure magic link — no account required on their side.",
    category: "product",
  },
  {
    q: "When should I upgrade to Pro?",
    a: "Upgrade when you need more clients, recurring invoices, Stripe checkout, or custom branding.",
    category: "plans",
  },
] as const;

export const HOME_FAQ_ITEMS = [
  {
    q: "Is there a free plan?",
    a: "Yes. Start on Free with core invoicing, PDF export, and the client portal. Upgrade when you need higher limits or recurring invoices.",
    category: "plans",
  },
  {
    q: "Do my clients need an account?",
    a: "No. Clients open a secure portal link to view invoices and pay online — no signup required on their side.",
    category: "product",
  },
  {
    q: "Can I accept card payments?",
    a: "Yes. Connect Stripe to send checkout links and record partial or full payments automatically.",
    category: "billing",
  },
  {
    q: "Can I use my own branding?",
    a: "Pro and Enterprise plans include custom logo and brand colors on invoices and the client portal.",
    category: "plans",
  },
] as const;

export const PRICING_FAQ = [
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrade or downgrade from Settings → Billing. Changes apply to your next billing cycle for paid plans.",
    category: "plans",
  },
  {
    q: "Is there a contract or minimum term?",
    a: "No long-term contract on Free or Pro. Enterprise agreements are customized with our sales team.",
    category: "plans",
  },
  {
    q: "What happens if I exceed my plan limits?",
    a: "You'll be prompted to upgrade before creating resources over your quota (clients, invoices per month, etc.).",
    category: "plans",
  },
  {
    q: "Do you offer refunds?",
    a: "Pro subscriptions can be cancelled anytime. Contact support for billing questions on your account.",
    category: "billing",
  },
] as const;

export const ACCOUNT_FAQ = [
  {
    q: "How do I verify my email?",
    a: "After signup we send a verification link. You can resend it from the verify-email page if needed.",
    category: "account",
  },
  {
    q: "Can I use Google to sign in?",
    a: "Yes, when Google OAuth is enabled on the platform. You can also register with email and password.",
    category: "account",
  },
] as const;

export const FAQ_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "plans", label: "Plans & pricing" },
  { id: "billing", label: "Billing & payments" },
  { id: "product", label: "Product" },
  { id: "account", label: "Account" },
] as const;

export const PRICING_HIGHLIGHTS = [
  "No credit card required on Free",
  "Cancel Pro anytime",
  "Live limits from your database",
  "Stripe optional on paid plans",
] as const;

/** Deduplicated FAQ list for the /faq page. */
export function buildMarketingFaqList() {
  const raw = [...HOME_FAQ_ITEMS, ...FEATURES_FAQ, ...PRICING_FAQ, ...ACCOUNT_FAQ];
  const seen = new Set<string>();
  return raw.filter((item) => {
    if (seen.has(item.q)) return false;
    seen.add(item.q);
    return true;
  });
}
