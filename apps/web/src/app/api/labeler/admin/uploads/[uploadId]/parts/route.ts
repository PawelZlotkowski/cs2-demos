import { z } from "zod";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";
import { signParts } from "@/lib/labeler/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z
  .object({
    partNumbers: z.array(z.number().int().min(1).max(10000)).max(10),
    completed: z
      .array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(200), bytes: z.number().int().positive() }).strict())
      .max(100),
  })
  .strict();

export const POST = route(async (request, { params }: Params<"uploadId">) => {
  const { uploadId } = await params;
  const value = await readJson(request, body, 32 * 1024);
  const tokenHash = await tokenHashOr401();
  return json(await signParts(tokenHash, uploadId, value.partNumbers, value.completed));
});
