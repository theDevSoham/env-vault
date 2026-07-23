import type { MetadataRoute } from "next";
import { SITE } from "@/src/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: SITE.url, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/login`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE.url}/signup`, lastModified, changeFrequency: "yearly", priority: 0.5 },
  ];
}
