/**
 * Shared request handling for /api/labeler/*: same-origin checks for cookie-authenticated
 * mutations, bounded JSON bodies, uniform errors and no-store responses.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ConfigurationError, isLabelerMode, labelerConfig } from "./config";
import { LabelerError } from "./db";

export const NO_STORE = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

export function json(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(data, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof LabelerError) {
    return json({ detail: error.message, ...error.extra }, { status: error.status });
  }
  if (error instanceof ConfigurationError) {
    // Names of missing settings are safe to show; their values never are.
    return json({ detail: error.message, missing: error.missing }, { status: 503 });
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return json({ detail: first ? `${first.path.join(".") || "request"}: ${first.message}` : "Invalid request." }, { status: 422 });
  }
  console.error("labeler request failed", error instanceof Error ? error.name : "unknown");
  return json({ detail: "Something went wrong on the server. Try again." }, { status: 500 });
}

type Handler<C> = (request: NextRequest, context: C) => Promise<NextResponse | Response>;

/**
 * Wraps a route handler: labeller mode only, same-origin protection for mutations, errors
 * mapped to JSON. Mutations must come from this site's pages (Origin plus a custom header that
 * a cross-site form cannot send without a CORS preflight).
 */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    if (!isLabelerMode()) return json({ detail: "Not found." }, { status: 404 });
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) assertSameOrigin(request);
      return await handler(request, context);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function assertSameOrigin(request: NextRequest): void {
  const config = labelerConfig();
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (request.headers.get("x-labeler-request") !== "1") {
    throw new LabelerError(403, "Use the labelling site to make this change.");
  }
  if (origin) {
    if (!config.allowedOrigins.includes(origin)) throw new LabelerError(403, "Cross-site requests are not allowed.");
  } else if (fetchSite && fetchSite !== "same-origin") {
    throw new LabelerError(403, "Cross-site requests are not allowed.");
  }
}

export async function readJson<T>(request: NextRequest, schema: ZodType<T>, maxBytes = 32 * 1024): Promise<T> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new LabelerError(413, "The request is too large.");
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new LabelerError(415, "Send JSON.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new LabelerError(413, "The request is too large.");
      }
      chunks.push(value);
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
  } catch {
    throw new LabelerError(400, "The request body is not valid JSON.");
  }
  return schema.parse(parsed);
}

export function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 100);
}
