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
    const proUntil = process.env.CURRENT_TERM_END; // e.g. "2026-12-15"
    if (!userId || !proUntil) {
      console.error("[StripeWebhook] skipping grant - missing", {
        hasUserId: !!userId,
        hasTermEnd: !!proUntil,
      });
    } else {
      const admin = createAdminClient();
      const { error } = await admin.from("user_plan").upsert(
        {
          user_id: userId,
          pro_until: proUntil,
          stripe_customer_id:
            typeof session.customer === "string" ? session.customer : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) {
        // Return 5xx so Stripe retries — the upsert is idempotent (onConflict user_id),
        // so a transient DB failure won't leave the user paid-but-not-Pro.
        console.error("[StripeWebhook] user_plan upsert error:", error);
        return new Response("upsert failed", { status: 500 });
      }
      console.log("[StripeWebhook] granted Pro to", userId, "until", proUntil);
    }
  }

  return new Response("ok", { status: 200 });
}
