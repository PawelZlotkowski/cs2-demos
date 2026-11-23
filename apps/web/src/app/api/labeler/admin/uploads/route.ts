import { z } from "zod";
import { tokenHashOr401 } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";
import { beginUpload } from "@/lib/labeler/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z
  .object({
    clipId: z.string().uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
  })
  .strict();

// Starts or resumes the single open upload for a draft clip. The server picks the bucket,
// key and upload ID; the response never includes them.
export const POST = route(async (request) => {
  const value = await readJson(request, body, 2048);
  const tokenHash = await tokenHashOr401();
  return json(await beginUpload(tokenHash, value));
});
