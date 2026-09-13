import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { AppNav } from "@/components/AppNav";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Market Edge — Portfolio Desk",
  description:
    "Multi-member investment portfolio tracker with Indian capital gains, live quotes, and technical insights.",
  applicationName: "Market Edge",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Market Edge",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0a5f5f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppNav />
        <main className="page-shell mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
