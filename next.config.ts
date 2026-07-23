import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // No user images exist and next/image is unused; disabling optimization
    // keeps sharp (open libvips CVEs, GHSA-f88m-g3jw-g9cj) out of every
    // runtime path (security review SR-7).
    unoptimized: true,
  },
  // libsodium ships its wasm inline; leave it out of the Server Components
  // bundle so it's loaded via native require() at runtime. Bundling it can
  // break the async wasm init in serverless (Vercel) → route handlers 500.
  serverExternalPackages: ["libsodium-wrappers-sumo"],
};

export default nextConfig;
