import { rpc } from "@/lib/labeler/server/db";
import { json, route } from "@/lib/labeler/server/http";
import { clearSessionCookie, sessionTokenHash } from "@/lib/labeler/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async () => {
  const tokenHash = await sessionTokenHash();
  if (tokenHash) await rpc("labeler_logout", { tokenHash });
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
});
