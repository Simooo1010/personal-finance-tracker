import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Unbounded } from "next/font/google";
import "./globals.css";

// Platform fonts, self-hosted by next/font (no request to Google at runtime).
// Fallback stacks are pinned so a browser's own default font is never used.
// Both are variable fonts, so every weight in their range is available.
//  - Bricolage Grotesque (200–800): all text, titles, labels, buttons.
//  - Unbounded (200–900): money amounts only, via the `font-display` utility.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-bricolage",
  fallback: ["system-ui", "Arial", "sans-serif"],
});

const unbounded = Unbounded({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-unbounded",
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
    <html lang="it" className={`dark ${bricolage.variable} ${unbounded.variable}`} suppressHydrationWarning>
      <head>
        {/* Dark is the default. Apply a saved light choice before first paint so there is no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('theme')==='light'){var r=document.documentElement;r.classList.remove('dark');r.classList.add('light')}}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-dvh flex flex-col font-sans">{children}</body>
    </html>
  );
}
