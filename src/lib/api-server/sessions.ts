import { eq } from "drizzle-orm";
import { generateSessionToken, hashSessionToken } from "../crypto";
import { getDb } from "../db";
import { sessions } from "../db/schema";
import { unauthorized } from "./errors";

/**
 * Cookie sessions (ADR-002). The cookie carries a random 256-bit token; the DB
 * stores only its BLAKE2b hash. Tokens authenticate API calls and can never
 * decrypt anything (handoff §23).
 */

const COOKIE_NAME = "ev_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(userId: string): Promise<{ token: string; cookie: string }> {
  const token = await generateSessionToken();
  const tokenHash = await hashSessionToken(token);
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return { token, cookie: buildCookie(token, SESSION_TTL_MS / 1000) };
}

function buildCookie(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie(): string {
  return buildCookie("", 0);
}

function readCookieToken(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME && rest.length > 0) return rest.join("=");
  }
  return null;
}

export async function getSessionUserId(request: Request): Promise<string | null> {
  const token = readCookieToken(request);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const rows = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await getDb().delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  return session.userId;
}

/** 401 unless the request carries a valid session. */
export async function requireSession(request: Request): Promise<{ userId: string }> {
  const userId = await getSessionUserId(request);
  if (!userId) throw unauthorized();
  return { userId };
}

export async function destroySession(request: Request): Promise<void> {
  const token = readCookieToken(request);
  if (!token) return;
  const tokenHash = await hashSessionToken(token);
  await getDb().delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

/** Invalidate every session for a user (password change — lifecycle §3). */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}
