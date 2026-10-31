import type { Metadata, Viewport } from "next";
import { Barlow } from "next/font/google";
import "./globals.css";

// Brand font, self-hosted by next/font (no request to Google at runtime).
// The fallback stack is pinned so a browser's default font is never used.
const barlow = Barlow({
  subsets: ["latin", "latin-ext"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-barlow",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Finance Tracker",
  description: "Personal Finance Tracker - Track your income and expenses",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Finance',
  },
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`dark ${barlow.variable}`}>
      <body className="min-h-dvh flex flex-col font-sans">{children}</body>
    </html>
  );
}
