import { z } from "zod";
import { HANDLE } from "@/lib/labeler/manifest";
import { codeDigest, generateCode, normaliseCode } from "@/lib/labeler/server/codes";
import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401 } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    handle: z.string().regex(HANDLE, "Use 1–40 letters, digits or underscores."),
  })
  .strict();

// Admin-panel accounts are always reviewers; the role is fixed server-side.
export const POST = route(async (request) => {
  const value = await readJson(request, body, 4096);
  const tokenHash = await tokenHashOr401();
  const code = generateCode();
  const result = await rpc<{ account: unknown }>("labeler_admin_create_reviewer", {
    tokenHash,
    displayName: value.displayName,
    handle: value.handle,
    codeDigest: codeDigest(normaliseCode(code)!, labelerConfig().pepper),
  });
  return json({ account: result.account, code }, { status: 201 });
});
