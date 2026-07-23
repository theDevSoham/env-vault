/** API-layer error with an HTTP status. Messages are safe, generic codes —
 *  never payload echoes (handoff §27, plannings/04 D5). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const unauthorized = () => new ApiError(401, "unauthorized");
export const forbidden = () => new ApiError(403, "forbidden");
export const notFound = () => new ApiError(404, "not_found");
export const badRequest = (code = "bad_request") => new ApiError(400, code);
export const unprocessable = (code = "invalid_body") => new ApiError(422, code);
export const tooManyRequests = () => new ApiError(429, "rate_limited");
