import HeaderAuth from "@/components/header-auth";
import { Poppins } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { createClient } from "@/utils/supabase/server";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(defaultUrl),
  title: "UT Registration GPT",
  description: "Find your perfect UT schedule with AI",
};

const poppinSans = Poppins({ weight: "400", subsets: ["latin"] });

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
    <html lang="en" className={poppinSans.className} suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {user && <Sidebar />}

          <main className="flex flex-col min-h-screen">
            <div className="w-full flex flex-col">
              <nav className="w-full absolute flex justify-center border-b border-b-foreground/10 h-16">
                <div className="w-full flex justify-end items-center p-3 px-5 text-sm">
                  <HeaderAuth />
                </div>
              </nav>
              <div className="flex flex-col flex-1">{children}</div>
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
