import { Geist_Mono, Poppins } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/utils/supabase/server";
import Navbar from "@/components/navbar";
import { Toaster } from "@/components/ui/toaster";
import { SchedulesProvider } from "@/lib/schedules";
import ClientErrorGuard from "@/components/client-error-guard";
import { CreditsToast } from "@/components/credits-toast";
import { Analytics } from "@vercel/analytics/next";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Forty",
  description:
    "Plan your UT Austin schedule with grade distributions, RateMyProfessors reviews and the live course schedule",
};

const poppinSans = Poppins({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html
      lang="en"
      className={`${poppinSans.className} ${geistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body
        className="bg-background text-foreground"
        style={
          { "--sidebar-width": user ? "15rem" : "0px" } as React.CSSProperties
        }
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClientErrorGuard />
          <CreditsToast />
          {user ? (
            <Sidebar
              userEmail={user.email ?? ""}
              userName={
                (user.user_metadata?.display_name as string) ??
                (user.user_metadata?.full_name as string) ??
                (user.user_metadata?.name as string) ??
                ""
              }
              userProvider={user.app_metadata?.provider ?? "google"}
            />
          ) : (
            <Navbar />
          )}

          <main
            style={{
              marginTop: user ? 0 : "4rem",
              marginLeft: "var(--sidebar-width, 0px)",
            }}
            className={`flex flex-col bg-background ${
              user ? "h-svh" : "h-[calc(100svh-4rem)]"
            }`}
          >
            {user ? (
              <SchedulesProvider>{children}</SchedulesProvider>
            ) : (
              children
            )}
          </main>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
