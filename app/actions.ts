"use server";

import { encodedRedirect } from "@/utils/utils";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const signOutAction = async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirect("/");
};

export const deleteAccountAction = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Bail before deleting anything if the admin client can't be built (missing service key) -
  // otherwise we'd wipe the user's rows but be unable to delete the account.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return { error: "Couldn't delete account. Try again." };

  // FKs to auth.users lack ON DELETE CASCADE, so the user's rows must be removed
  // first or auth.admin.deleteUser fails. RLS scopes these deletes to the user's own rows.
  const { error: sErr } = await supabase
    .from("schedules")
    .delete()
    .eq("user_id", user.id);
  const { error: cErr } = await supabase
    .from("conversations")
    .delete()
    .eq("user_id", user.id);
  if (sErr || cErr) return { error: "Couldn't clear your data. Try again." };

  const admin = createAdminClient();
  const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
  if (dErr) return { error: "Couldn't delete account. Try again." };

  await supabase.auth.signOut();
  return redirect("/");
};

// Pay-what-you-want credit top-up (min $1); the webhook credits the pre-discount amount.
export const createCheckoutSession = async (amountCents: number) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const amount = Math.round(amountCents);
  if (!Number.isFinite(amount) || amount < 100 || amount > 50000) {
    return { error: "Top-up must be between $1 and $500." };
  }

  const origin = (await headers()).get("origin") ?? "";
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      allow_promotion_codes: true,
      customer_email: user.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name: "Forty AI credits" },
          },
        },
      ],
      metadata: { user_id: user.id },
      success_url: `${origin}/?credits=1`,
      cancel_url: `${origin}/`,
    });
    return { url: session.url };
  } catch (e) {
    console.error("checkout error:", e);
    return { error: "Couldn't start checkout. Try again." };
  }
};

export const signInWithGoogleAction = async () => {
  const supabase = await createClient();
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect("error", "/", error.message);
  }

  return redirect(data.url);
};
