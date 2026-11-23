"use client";

/** Browser calls to /api/labeler/*. Codes and session tokens never touch storage or URLs. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  let response: Response;
  try {
    response = await fetch(`/api/labeler${path}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: init.signal,
      headers: {
        Accept: "application/json",
        ...(method === "GET" ? {} : { "X-Labeler-Request": "1" }),
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiError(0, "No connection. Check your internet connection and try again.");
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : `The request failed (${response.status}).`;
    if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      window.location.assign("/label/login?ended=1");
    }
    throw new ApiError(response.status, detail, body);
  }
  return body as T;
}
