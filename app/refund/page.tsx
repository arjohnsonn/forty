import { LegalShell } from "@/components/legal-shell";
import { COMPANY, CONTACT_EMAIL } from "@/lib/legal";

export const metadata = { title: "Refund Policy - Forty" };

export default function RefundPage() {
  return (
    <LegalShell title="Refund Policy">
      <p>
        <strong>{COMPANY} Pro</strong> is a one-time charge of $3.99 USD that
        unlocks higher usage through the end of the current semester. It is a
        digital product and does not auto-renew.
      </p>

      <h2>Refunds</h2>
      <p>
        If you are not satisfied, email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within{" "}
        <strong>14 days</strong> of your purchase and we will issue a full
        refund - no hassle. Refunds are returned to your original payment method
        via Stripe and may take a few business days to appear.
      </p>

      <h2>After 14 days</h2>
      <p>
        After the 14-day window, purchases are generally non-refundable since
        Pro is a low-cost, semester-long digital product. We may still grant
        refunds at our discretion - for example, a duplicate charge or a billing
        error.
      </p>

      <h2>How to request a refund</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the
        address associated with your account and include the date of your
        purchase.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
