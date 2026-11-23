import { z } from "zod";
import { clientBucket, loginDigest, newSessionToken } from "@/lib/labeler/server/codes";
import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { clientAddress, json, readJson, route } from "@/lib/labeler/server/http";
import { sessionTokenHash, setSessionCookie, type Account } from "@/lib/labeler/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ code: z.string().max(200) }).strict();
const INVALID = "That access code is not valid. Check it and try again.";

export const POST = route(async (request) => {
  const { code } = await readJson(request, body, 2048);
  const config = labelerConfig();
  // A different person signing in on this browser ends the previous session first.
  const previous = await sessionTokenHash();
  if (previous) await rpc("labeler_logout", { tokenHash: previous }).catch(() => undefined);
  const session = newSessionToken();
  const result = await rpc<{ status: string; account?: Account; expiresAt?: string; retryAfter?: number }>("labeler_login", {
    codeDigest: loginDigest(code, config.pepper),
    ipBucket: clientBucket(clientAddress(request), config.pepper),
    tokenHash: session.hash,
    windowSeconds: config.login.windowSeconds,
    ipLimit: config.login.ipLimit,
    globalLimit: config.login.globalLimit,
    reviewerTtlSeconds: config.sessions.reviewerSeconds,
    adminTtlSeconds: config.sessions.adminSeconds,
  });
  if (result.status === "rate_limited") {
    return json(
      { detail: "Too many sign-in attempts from this connection. Wait a few minutes, then try again." },
      { status: 429, headers: { "Retry-After": String(result.retryAfter ?? 600) } },
    );
  }
  if (result.status !== "ok" || !result.account || !result.expiresAt) {
    return json({ detail: INVALID }, { status: 401 });
  }
  const response = json({
    account: { id: result.account.id, displayName: result.account.displayName, role: result.account.role },
    redirect: result.account.role === "admin" ? "/label/admin" : "/label",
  });
  setSessionCookie(response, session.token, new Date(result.expiresAt));
  return response;
});
