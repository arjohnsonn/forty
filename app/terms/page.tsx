import { LegalShell } from "@/components/legal-shell";
import { COMPANY, CONTACT_EMAIL, SITE_URL } from "@/lib/legal";

export const metadata = { title: "Terms of Service - Forty" };

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        Welcome to {COMPANY} ("{COMPANY}," "we," "us," or "our"), a tool that
        helps University of Texas at Austin students plan their course schedules
        using AI, historical grade data, and professor ratings. By accessing or
        using {COMPANY} (the "Service") at {SITE_URL}, you agree to these Terms
        of Service ("Terms"). If you do not agree, do not use the Service.
      </p>

      <h2>1. Who can use {COMPANY}</h2>
      <p>
        You must be at least 13 years old and able to form a binding contract.
        The Service is intended for current and prospective UT Austin students.
        You are responsible for activity under your account.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You sign in with Google. You are responsible for keeping access to your
        Google account secure. You can delete your {COMPANY} account at any time
        from Account Settings, which removes your saved schedules and chat
        history.
      </p>

      <h2>3. {COMPANY} Pro</h2>
      <p>
        {COMPANY} offers a paid "Pro" plan for a one-time charge of $3.99 USD
        per semester. Payment is processed by Stripe; we do not store your card
        details. Pro is not an auto-renewing subscription - it grants higher
        usage limits through the end of the current semester and does not renew
        automatically. See our Refund Policy.
      </p>

      <h2>4. Informational use only - not official advice</h2>
      <p>
        {COMPANY}'s schedules, course information, professor ratings, grade
        distributions, and AI-generated responses are provided for informational
        and planning purposes only. They may be incomplete, outdated, or
        inaccurate. {COMPANY} is not affiliated with, endorsed by, or sponsored
        by The University of Texas at Austin or RateMyProfessors. Always confirm
        course offerings, times, prerequisites, and registration details with
        official UT resources before registering. You are solely responsible for
        your registration decisions.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>misuse, overload, or attempt to disrupt the Service;</li>
        <li>access it through automated means or scrape it;</li>
        <li>resell or commercially exploit it;</li>
        <li>reverse engineer it; or</li>
        <li>use it to violate any law or the rights of others.</li>
      </ul>

      <h2>6. Third-party services and data</h2>
      <p>
        {COMPANY} relies on third parties including Google (sign-in and AI),
        Supabase (data storage), Cloudflare (compute), and Stripe (payments),
        and incorporates publicly available data such as UT course information
        and RateMyProfessors ratings. Your use of those services is also subject
        to their respective terms.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        {COMPANY} and its content, design, and software are owned by us or our
        licensors. You may use the Service for your personal, non-commercial
        schedule planning.
      </p>

      <h2>8. Disclaimer of warranties</h2>
      <p>
        The Service is provided "as is" and "as available," without warranties
        of any kind, express or implied, including fitness for a particular
        purpose and accuracy of information.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, {COMPANY} and its operator will
        not be liable for any indirect, incidental, or consequential damages, or
        for any registration, academic, or financial outcomes arising from your
        use of the Service. Our total liability for any claim is limited to the
        amount you paid us in the prior 12 months (or $0 if you are on the free
        plan).
      </p>

      <h2>10. Termination</h2>
      <p>
        We may suspend or terminate access if you violate these Terms. You may
        stop using {COMPANY} and delete your account at any time.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these Terms; material changes will be reflected by the
        "Last updated" date above. Continued use after changes means you accept
        them.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Texas, USA, without
        regard to its conflict-of-law rules.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        .
      </p>
    </LegalShell>
  );
}
