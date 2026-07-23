import type { Metadata } from "next";
import { Providers } from "@/src/components/Providers";
import { SITE, jsonLd } from "@/src/lib/seo";
import "./globals.css";

// The nonce-based CSP (proxy.ts) generates a fresh nonce per request; Next only
// stamps that nonce onto script tags during dynamic rendering. Static pages ship
// a build-time nonce that never matches the runtime CSP header, so on prod their
// scripts get blocked, hydration fails, and forms fall back to a native submit
// (credentials in the URL). Forcing dynamic rendering keeps the nonce consistent.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: "%s · Env Vault",
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.author }],
  creator: SITE.author,
  publisher: SITE.name,
  category: "technology",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    url: SITE.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
        {/* Static schema.org data (no user input) — the Next-recommended JSON-LD pattern. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
        />
      </body>
    </html>
  );
}
