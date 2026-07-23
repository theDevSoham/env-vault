/** Minimal fetch wrapper for the Env Vault API with bearer auth. */

export class CliApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(`${status}:${code}`);
  }
}

export async function apiCall<T>(
  serverUrl: string,
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(new URL(path, serverUrl), {
    method,
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    let code = "error";
    try {
      code = ((await response.json()) as { error?: string }).error ?? code;
    } catch {
      /* non-JSON */
    }
    throw new CliApiError(response.status, code);
  }
  return (await response.json()) as T;
}
