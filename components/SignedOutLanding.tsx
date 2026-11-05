import Link from "next/link";
import { signInWithGoogleAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { GoogleIcon } from "@/components/google-icon";
import { LandingPreview } from "@/components/LandingPreview";

export default function SignedOutLanding({ error }: { error?: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-12 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,7fr)] lg:gap-16">
        <div className="flex flex-col items-start">
          <h1 className="text-4xl font-medium text-balance leading-[1.08] tracking-[-0.02em] sm:text-5xl">
            Plan your UT semester with the grade data in hand
          </h1>
          <p className="mt-5 max-w-[36rem] text-lg leading-8 text-muted-foreground">
            Ask about any course or professor. Forty answers from UT grade
            distributions, RateMyProfessors reviews and the course schedule,
            then lays out a weekly schedule you can save.
          </p>
          <form className="mt-8">
            <SubmitButton
              formAction={signInWithGoogleAction}
              formNoValidate
              size="lg"
              pendingText="Opening Google…"
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              Continue with Google
            </SubmitButton>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Couldn&apos;t sign in with Google: {error}
            </p>
          )}
        </div>
        <LandingPreview />
      </section>
      <nav className="flex shrink-0 justify-center gap-4 pb-6 text-xs text-muted-foreground">
        <Link href="/terms" className="transition-colors hover:text-foreground">
          Terms
        </Link>
        <Link href="/privacy" className="transition-colors hover:text-foreground">
          Privacy
        </Link>
        <Link href="/refund" className="transition-colors hover:text-foreground">
          Refunds
        </Link>
      </nav>
    </div>
  );
}
