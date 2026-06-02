import { signInWithGoogleAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { GoogleIcon } from "@/components/google-icon";

export default function SignedOutLanding() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl sm:text-3xl">
          Plan your{" "}
          <span className="font-semibold text-texas">perfect UT schedule</span>
        </h1>
        <p className="max-w-md text-muted-foreground">
          Sign in to plan your schedule with the help of AI using data from UT, RateMyProfessor, and more!
        </p>
        <form className="mt-6">
          <SubmitButton
            formAction={signInWithGoogleAction}
            formNoValidate
            pendingText="Continuing…"
          >
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
