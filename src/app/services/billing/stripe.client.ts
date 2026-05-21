import Stripe from "stripe";

import { config } from "../../config";
import { ApiError } from "../../errors/ApiError";

let stripeClient: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(config.stripe.secretKey?.trim());
}

export function getStripeClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new ApiError(503, "Stripe is not configured", {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  if (!stripeClient) {
    stripeClient = new Stripe(config.stripe.secretKey!, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
    });
  }

  return stripeClient;
}
