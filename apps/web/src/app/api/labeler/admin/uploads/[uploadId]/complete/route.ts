import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";
import { completeUpload } from "@/lib/labeler/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Completion streams the stored object once to verify its SHA-256.
export const maxDuration = 300;

export const POST = route(async (_request, { params }: Params<"uploadId">) => {
  const { uploadId } = await params;
  const tokenHash = await tokenHashOr401();
  return json(await completeUpload(tokenHash, uploadId));
});
