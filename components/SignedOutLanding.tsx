import { signInWithGoogleAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";

export default function SignedOutLanding() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-3xl">
          Plan your{" "}
          <span className="font-semibold text-texas">perfect UT schedule</span>
        </h1>
        <p className="text-muted-foreground">
          Sign in to start chatting and save your conversation history.
        </p>
        <form>
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
