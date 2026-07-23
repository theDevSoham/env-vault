# SEO & Brand Assets · Worklog · 2026-07-23

**Trigger:** the site shipped with the default create-next-app favicon and no SEO — user asked for a real favicon, OG image, JSON-LD, and SEO metadata.

## What was done

All assets are **self-contained** (no external fonts/images fetched — respects the offline/CSP posture) and generated from code or static SVG.

- **`src/lib/seo.ts`** — single source of truth: `SITE` (name/title/description/keywords/tagline/author), `BRAND` colors (kept in sync with globals.css tokens), a reusable `shieldSvg()` glyph, and a `jsonLd()` builder.
- **Favicon** — `app/icon.svg` (emerald vault-shield on a dark rounded square); removed the default `app/favicon.ico`. Next emits `<link rel="icon" type="image/svg+xml">`.
- **Apple touch icon** — `app/apple-icon.tsx` (`ImageResponse`, 180×180 PNG): shield on a rounded dark tile, no text ⇒ no font dependency.
- **OG image** — `app/opengraph-image.tsx` (`ImageResponse`, 1200×630 PNG): shield + wordmark, a "Zero-knowledge · client-side encryption" pill, headline, subtitle, tagline, subtle accent gradient. **Twitter image** re-exports it (`app/twitter-image.tsx`).
- **Metadata** (`app/layout.tsx`): `metadataBase`, title default + `%s · Env Vault` template, description, keywords, authors/creator/publisher, full `openGraph` + `twitter` (summary_large_image), `robots` (index/follow + googleBot max-image-preview).
- **JSON-LD** — `SoftwareApplication` (DeveloperApplication, free offer, feature list) + `Organization`, injected in the layout as a static `application/ld+json` block.
- **`app/robots.ts`** (allow marketing, disallow /vaults, /devices, /api) and **`app/sitemap.ts`** (landing/login/signup).

## Verification (browser + curl, live)

- Fetched the generated PNGs and **viewed them**: OG image renders correctly (94 KB, 1200×630, all text legible with `ImageResponse`'s default font — no custom font needed); apple-icon renders the shield tile cleanly.
- `curl` of `/` head: title, description, og:* (incl. og:image 1200×630 + alt), twitter:* (image via re-export), all present. JSON-LD contains SoftwareApplication + Organization.
- `/robots.txt` and `/sitemap.xml` serve correct content; favicon + apple-touch-icon `<link>` tags emitted; browser tab title updated.
- **JSON-LD does not trip the strict CSP** — no console violations on the landing page (ld+json is a non-executable data block; no nonce needed, pages stay static).
- `tsc`/lint clean; 98 tests green; `next build` emits `/icon.svg`, `/apple-icon`, `/opengraph-image`, `/robots.txt`, `/sitemap.xml`.

## Note / follow-up

- **`SITE_URL` in `src/lib/seo.ts` is a placeholder** (`https://env-vault.app`). It drives `metadataBase`, canonical OG/Twitter image URLs, robots sitemap, and sitemap entries — **update it to the real domain at deploy.** (In dev, Next resolves the OG image URL against localhost; production uses `metadataBase`.)
