/**
 * Central SEO + brand constants and structured-data builder.
 * Imported by the root layout (metadata + JSON-LD) and the metadata image
 * routes (icon/apple-icon/opengraph-image). Pure data — no client code.
 */

// Deployed origin. Used as metadataBase so OG/Twitter image URLs, canonical
// links and the sitemap resolve to absolute URLs. Update if the domain changes
// (e.g. a custom domain replacing the Vercel URL).
export const SITE_URL = "https://env-vault-blond.vercel.app";

export const SITE = {
  name: "Env Vault",
  title: "Env Vault — Zero-knowledge secrets storage for developers",
  shortTitle: "Env Vault",
  description:
    "Zero-knowledge encrypted storage and sharing for .env secrets and secret files. Everything is encrypted in your browser — the server stores ciphertext it cannot read. Versioned like Git, shareable by cryptography, with a CLI for CI.",
  tagline: "The server stores your secrets. Only your devices understand them.",
  url: SITE_URL,
  author: "Soham Das",
  keywords: [
    "env vault",
    "secrets manager",
    "zero-knowledge",
    "end-to-end encryption",
    ".env",
    "dotenv",
    "environment variables",
    "secret sharing",
    "developer tools",
    "encrypted storage",
    "CLI secrets",
  ],
} as const;

/** Brand colors (kept in sync with globals.css @theme tokens). */
export const BRAND = {
  bg: "#0a0b0d",
  surface: "#16181d",
  border: "#262a31",
  accent: "#10b981",
  accentFg: "#04120c",
  text: "#e8eaed",
  muted: "#9aa1ab",
} as const;

/**
 * The vault-shield glyph as a standalone SVG string, parameterized so it can be
 * used both as a static favicon and embedded (data URI) inside generated
 * OG / apple-icon images.
 */
export function shieldSvg(opts: {
  size?: number;
  shield?: string;
  keyhole?: string;
  bg?: string | null;
} = {}): string {
  const { size = 32, shield = BRAND.accent, keyhole = BRAND.accentFg, bg = null } = opts;
  const rect = bg
    ? `<rect width="32" height="32" rx="7" fill="${bg}"/>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">${rect}<path d="M16 3.2 26.5 7v8.1c0 6.6-4.4 11.2-10.5 13.7C9.9 26.3 5.5 21.7 5.5 15.1V7L16 3.2Z" fill="${shield}"/><circle cx="16" cy="14.2" r="3.1" fill="${keyhole}"/><path d="M16 16.4v4.1" stroke="${keyhole}" stroke-width="2.6" stroke-linecap="round"/></svg>`;
}

/** schema.org JSON-LD: the product as a SoftwareApplication + its publisher. */
export function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.name,
        description: SITE.description,
        url: SITE.url,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web, Windows, macOS, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Client-side end-to-end encryption",
          "Encrypted .env and secret file storage",
          "Immutable revision history with structural diffs",
          "Cryptographic member removal (key rotation)",
          "CLI with device authorization and CI service accounts",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: SITE.url,
        founder: { "@type": "Person", name: SITE.author },
      },
    ],
  };
}
