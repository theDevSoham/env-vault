import { ImageResponse } from "next/og";
import { BRAND, shieldSvg } from "@/src/lib/seo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon (PNG). No text → no font dependency. */
export default function AppleIcon() {
  const shield = `data:image/svg+xml,${encodeURIComponent(shieldSvg({ size: 120 }))}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.bg,
          borderRadius: 40,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={shield} width={120} height={120} alt="" />
      </div>
    ),
    size
  );
}
