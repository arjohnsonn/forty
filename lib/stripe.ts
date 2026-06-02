import Stripe from "stripe";

// Lazily constructed so importing this module doesn't throw when STRIPE_SECRET_KEY is unset
// (it's only needed by the checkout action and the webhook route).
let client: InstanceType<typeof Stripe> | null = null;

export const getStripe = () => {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
};
