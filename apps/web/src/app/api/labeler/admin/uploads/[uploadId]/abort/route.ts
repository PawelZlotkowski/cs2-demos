import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";
import { abortUpload } from "@/lib/labeler/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (_request, { params }: Params<"uploadId">) => {
  const { uploadId } = await params;
  const tokenHash = await tokenHashOr401();
  return json(await abortUpload(tokenHash, uploadId));
});
