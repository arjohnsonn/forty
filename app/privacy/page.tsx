import { LegalShell } from "@/components/legal-shell";
import { COMPANY, CONTACT_EMAIL } from "@/lib/legal";

export const metadata = { title: "Privacy Policy - Forty" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This Privacy Policy explains what information {COMPANY} collects, how we
        use it, and your choices.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> when you sign in with Google, we
          receive your name and email address.
        </li>
        <li>
          <strong>Content you create:</strong> saved schedules, selected
          courses, and the messages you send in chat.
        </li>
        <li>
          <strong>Usage data:</strong> we track your AI usage (token-based) to
          enforce free and Pro limits.
        </li>
        <li>
          <strong>Payment information:</strong> Pro purchases are processed by
          Stripe. We do not receive or store your full card number - Stripe
          handles payment data.
        </li>
      </ul>

      <h2>2. How we use your information</h2>
      <p>
        To provide and operate the Service, generate AI responses, build and
        save schedules, enforce usage limits and billing, respond to support
        requests, and improve {COMPANY}.
      </p>

      <h2>3. AI processing</h2>
      <p>
        When you chat with {COMPANY}, your messages and relevant course data are
        sent to Google's Gemini API to generate responses. That processing is
        subject to Google's terms and privacy practices. Please do not share
        sensitive personal information in chat.
      </p>

      <h2>4. Where your data is stored</h2>
      <p>
        Your account data, schedules, and chat history are stored in our
        database (Supabase / PostgreSQL). Application logic runs on Cloudflare
        Workers. Data may be processed in the United States.
      </p>

      <h2>5. Sharing</h2>
      <p>
        We do not sell your personal information. We share data only with the
        service providers needed to run {COMPANY} - Google (sign-in and AI),
        Supabase, Cloudflare, and Stripe (payments) - each acting on our behalf.
      </p>

      <h2>6. Cookies</h2>
      <p>
        We use cookies only to keep you signed in (authentication sessions). We
        do not use third-party advertising cookies.
      </p>

      <h2>7. Data retention and deletion</h2>
      <p>
        We keep your data while your account is active. You can delete your
        account at any time from Account Settings, which permanently removes
        your schedules and chat history. You may also email us to request
        deletion.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can access your information in the app, edit your display name, and
        delete your account and data at any time.
      </p>

      <h2>9. Security</h2>
      <p>
        We use reasonable measures to protect your data, but no method of
        transmission or storage is 100% secure.
      </p>

      <h2>10. Children</h2>
      <p>
        {COMPANY} is intended for college students and is not directed to
        children under 13. We do not knowingly collect data from children under
        13.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update this policy; changes are reflected by the "Last updated"
        date above.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about your privacy? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalShell>
  );
}
