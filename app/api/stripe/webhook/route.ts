import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";

export const runtime = "nodejs"; // the Stripe SDK needs Node, not the Edge runtime

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 500 });

  const stripe = getStripe();
  // constructEvent needs the exact raw body, so read it as text (not parsed JSON).
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    console.error("[StripeWebhook] signature error:", e);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object; // narrowed to a Checkout.Session
    const userId = session.metadata?.user_id;
    // Credit the pre-discount amount, so a promo code is bonus credit (not less).
    const amount = (session.amount_subtotal ?? 0) / 100;
    const paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;
    if (!userId || amount <= 0) {
      console.error("[StripeWebhook] skipping credit - missing/zero", {
        hasUserId: !!userId,
        amount,
      });
    } else {
      const admin = createAdminClient();
      // Idempotent per event.id, so a Stripe retry can't double-credit; 5xx makes Stripe retry.
      const { error } = await admin.rpc("add_credit", {
        p_event: event.id,
        p_user: userId,
        p_amount: amount,
        p_payment_intent: paymentIntent,
      });
      if (error) {
        console.error("[StripeWebhook] add_credit error:", error);
        return new Response("credit failed", { status: 500 });
      }
      console.log("[StripeWebhook] added", amount, "credit to", userId);
    }
  }

  // Refund: claw back the refunded amount from the user's credit balance.
  if (event.type === "refund.created") {
    const refund = event.data.object; // narrowed to a Refund
    const paymentIntent =
      typeof refund.payment_intent === "string" ? refund.payment_intent : null;
    const amount = (refund.amount ?? 0) / 100;
    if (!paymentIntent || amount <= 0) {
      console.error("[StripeWebhook] skipping refund - missing/zero", {
        hasPaymentIntent: !!paymentIntent,
        amount,
      });
    } else {
      const admin = createAdminClient();
      const { error } = await admin.rpc("refund_credit", {
        p_event: event.id,
        p_payment_intent: paymentIntent,
        p_amount: amount,
      });
      if (error) {
        console.error("[StripeWebhook] refund_credit error:", error);
        return new Response("refund failed", { status: 500 });
      }
      console.log("[StripeWebhook] clawed back", amount, "for", paymentIntent);
    }
  }

  return new Response("ok", { status: 200 });
}
