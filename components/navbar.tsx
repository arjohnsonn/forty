import Link from "next/link";
import Image from "next/image";
import { signInWithGoogleAction } from "@/app/actions";
import { ThemeSwitcher } from "@/components/theme-switcher";

export default function Navbar() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 h-16 bg-background">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg transition-colors hover:text-muted-foreground"
        >
          <Image src="/forty-logo.png" alt="" width={24} height={24} priority />
          <span className="text-base font-medium">Forty</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <form>
            <button
              formAction={signInWithGoogleAction}
              formNoValidate
              className="h-9 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
