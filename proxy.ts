import { NextRequest, NextResponse } from "next/server";

/**
 * Security headers for all pages (plannings/05 E6, threat-model T8 — XSS is
 * the highest-priority risk because crypto runs in the browser).
 *
 * - script-src: nonce + strict-dynamic (per Next 16 CSP guide);
 *   'wasm-unsafe-eval' is required for libsodium's wasm module;
 *   'unsafe-eval' only in development (React dev tooling).
 * - style-src: 'unsafe-inline' is a DOCUMENTED EXCEPTION — Next/Tailwind inject
 *   style tags without nonces in several paths; style injection is a far lower
 *   risk than script injection and script-src stays strict. Revisit in Phase H.
 * - connect-src 'self': the client can talk to nothing but our own API.
 * - No third-party origin appears anywhere by construction.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: [
    // all pages; skip static assets and the API (API responses are JSON, not documents)
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
