import { config } from "../../config";

export function isStripeConfigured(): boolean {
  return Boolean(config.stripe.secretKey?.trim());
}

/**
 * Stripe SDK placeholder — install `stripe` and return `new Stripe(config.stripe.secretKey)`
 * when you implement checkout and webhooks.
 */
export function getStripeClient(): null {
  if (!isStripeConfigured()) return null;
  return null;
}
