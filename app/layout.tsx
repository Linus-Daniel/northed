import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import TopNav from "@/components/TopNav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "NorthEd — lessons from people who teach",
    template: "%s · NorthEd",
  },
  description:
    "NorthEd is where tutors publish lessons and students learn at their own pace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <ConvexClientProvider>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-forest focus:px-4 focus:py-2 focus:text-sm focus:text-surface"
          >
            Skip to content
          </a>
          <TopNav />
          <main id="content">{children}</main>
          <footer className="mt-24 border-t border-rule">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-10 text-sm text-ink-faint sm:flex-row sm:items-center sm:justify-between">
              <p>NorthEd — a place for lessons, taught properly.</p>
              <p className="text-xs uppercase tracking-[0.16em]">
                Convex · real-time by default
              </p>
            </div>
          </footer>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
