import { signInWithGoogleAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export default function SignedOutLanding() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="whitespace-nowrap text-3xl">
          Plan your{" "}
          <span className="font-semibold text-texas">perfect UT schedule</span>
        </h1>
        <p className="whitespace-nowrap text-muted-foreground">
          Sign in to plan your schedule with the help of AI using UT data
        </p>
        <form className="mt-6">
          <SubmitButton
            formAction={signInWithGoogleAction}
            formNoValidate
            pendingText="Continuing…"
          >
            Continue with Google
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
