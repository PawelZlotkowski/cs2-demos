import { z } from "zod";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The reviewer identity comes from the session cookie only; the body carries the note.
const body = z
  .object({
    requestId: z.string().uuid(),
    previousRevision: z.number().int().positive().nullable(),
    status: z.enum(["draft", "complete", "skipped"]),
    notes: z.string().max(6000),
    assessment: z.enum(["good", "mistake", "uncertain"]).nullable(),
    language: z.enum(["en", "pl"]),
    issue: z.enum(["wrong_footage", "insufficient_context"]).nullable(),
    confirmFootage: z.boolean(),
  })
  .strict();

export const PUT = route(async (request, { params }: Params<"clipId">) => {
  const { clipId } = await params;
  const value = await readJson(request, body, 32 * 1024);
  const tokenHash = await tokenHashOr401();
  const result = await rpc<{ result: string; review?: unknown; current?: unknown; headRevision?: number }>("labeler_reviewer_save", {
    tokenHash,
    clipId,
    ...value,
  });
  if (result.result === "conflict") {
    return json({ detail: "This clip's note changed in another tab or device.", current: result.current }, { status: 409 });
  }
  return json(result);
});
