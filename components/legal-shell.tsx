import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { COMPANY, LEGAL_UPDATED } from "@/lib/legal";

export function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to {COMPANY}
        </Link>
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Last updated: {LEGAL_UPDATED}
        </p>
        <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">
          {children}
        </div>
      </div>
    </div>
  );
}
