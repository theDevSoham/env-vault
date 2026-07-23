import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // No user images exist and next/image is unused; disabling optimization
    // keeps sharp (open libvips CVEs, GHSA-f88m-g3jw-g9cj) out of every
    // runtime path (security review SR-7).
    unoptimized: true,
  },
};

export default nextConfig;
