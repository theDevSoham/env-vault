import { ZodError, type ZodType } from "zod";
import {
  InvalidEnvelopeError,
  UnsupportedEnvelopeError,
} from "../crypto";
import {
  InvitationStateError,
  NotFoundError,
  RevisionConflictError,
  RotationConflictError,
} from "../db";
import { ApiError, unprocessable } from "./errors";

/**
 * HTTP plumbing for route handlers (plannings/04 D5).
 *
 * LOGGING RULE: nothing here (or in any handler) may log request bodies,
 * headers, or payloads. On error we log method, path, and status — that's all.
 * Error responses carry generic codes, never echoes of input.
 */

const DEFAULT_BODY_LIMIT = 1024 * 1024; // 1 MiB
export const LARGE_BODY_LIMIT = 64 * 1024 * 1024; // 64 MiB (files, rotation)

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      // API responses carry envelopes/session data — never cacheable (SR-4)
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

/** Read + validate a JSON body with a hard size cap. */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  limitBytes = DEFAULT_BODY_LIMIT
): Promise<T> {
  const raw = await request.arrayBuffer();
  if (raw.byteLength > limitBytes) throw new ApiError(413, "body_too_large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw unprocessable("invalid_json");
  }
  return schema.parse(parsed);
}

function toResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ error: error.code }, error.status);
  }
  if (error instanceof ZodError) {
    return json({ error: "invalid_body" }, 422);
  }
  if (error instanceof RevisionConflictError) {
    return json({ error: "revision_conflict", currentHead: error.currentHead }, 409);
  }
  if (error instanceof RotationConflictError) {
    return json({ error: "rotation_conflict" }, 409);
  }
  if (error instanceof InvitationStateError) {
    return json({ error: "invitation_state" }, 409);
  }
  if (error instanceof NotFoundError) {
    return json({ error: "not_found" }, 404);
  }
  if (error instanceof InvalidEnvelopeError || error instanceof UnsupportedEnvelopeError) {
    return json({ error: "invalid_envelope" }, 422);
  }
  return json({ error: "internal" }, 500);
}

type Handler<C> = (request: Request, context: C) => Promise<Response>;

/** Wrap a route handler: typed-error mapping + minimal, body-free logging. */
export function withRoute<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const response = toResponse(error);
      if (response.status >= 500) {
        // method + path + status only — never bodies or error details with payloads
        const path = new URL(request.url).pathname;
        console.error(`[api] ${request.method} ${path} -> ${response.status}`);
      }
      return response;
    }
  };
}
