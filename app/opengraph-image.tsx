import { ImageResponse } from "next/og";
import { BRAND, SITE, shieldSvg } from "@/src/lib/seo";

export const alt = "Env Vault — zero-knowledge secrets storage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Social share image (1200×630 PNG). Uses the default ImageResponse font;
 * verified rendered in-browser. Served as an image resource (no page CSP).
 */
export default function OpengraphImage() {
  const shield = `data:image/svg+xml,${encodeURIComponent(shieldSvg({ size: 96 }))}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.bg,
          backgroundImage: `radial-gradient(1000px 500px at 85% -10%, ${BRAND.accent}22, transparent), radial-gradient(700px 400px at 0% 120%, ${BRAND.surface}, transparent)`,
          padding: 72,
          color: BRAND.text,
          fontFamily: "sans-serif",
        }}
      >
        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shield} width={72} height={72} alt="" />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>Env Vault</div>
        </div>

        {/* headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${BRAND.accent}44`,
              background: `${BRAND.accent}1a`,
              color: BRAND.accent,
              fontSize: 22,
            }}
          >
            Zero-knowledge · client-side encryption
          </div>
          <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
            Secrets storage where the server can&apos;t read your secrets.
          </div>
          <div style={{ fontSize: 30, color: BRAND.muted, maxWidth: 900 }}>
            Encrypted .env and secret files. Versioned like Git, shared by cryptography, with a CLI for CI.
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", fontSize: 24, color: BRAND.muted }}>{SITE.tagline}</div>
      </div>
    ),
    size
  );
}
