import { z } from "zod";
import { codeDigest, generateCode, normaliseCode } from "@/lib/labeler/server/codes";
import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";
import { clearSessionCookie } from "@/lib/labeler/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ action: z.enum(["deactivate", "activate", "regenerate", "revoke"]) }).strict();

function freshCode() {
  const code = generateCode();
  return { code, digest: codeDigest(normaliseCode(code)!, labelerConfig().pepper) };
}

export const POST = route(async (request, { params }: Params<"accountId">) => {
  const { accountId } = await params;
  const { action } = await readJson(request, body, 1024);
  const tokenHash = await tokenHashOr401();
  let code: string | undefined;
  let result: { self?: boolean; revokedSessions?: number; account?: unknown };
  if (action === "deactivate") {
    result = await rpc("labeler_admin_set_status", { tokenHash, accountId, status: "inactive" });
  } else if (action === "activate") {
    const fresh = freshCode();
    code = fresh.code;
    result = await rpc("labeler_admin_set_status", { tokenHash, accountId, status: "active", codeDigest: fresh.digest });
  } else if (action === "regenerate") {
    const fresh = freshCode();
    code = fresh.code;
    result = await rpc("labeler_admin_regenerate_code", { tokenHash, accountId, codeDigest: fresh.digest });
  } else {
    result = await rpc("labeler_admin_revoke_sessions", { tokenHash, accountId });
  }
  const response = json({ ...result, ...(code ? { code } : {}) });
  // Changing your own credentials ends this session too.
  if (result.self && action !== "activate") clearSessionCookie(response);
  return response;
});
