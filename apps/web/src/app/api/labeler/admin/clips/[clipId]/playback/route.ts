import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";
import { objectStore } from "@/lib/labeler/server/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin preview of any ready clip, published or not.
export const GET = route(async (_request, { params }: Params<"clipId">) => {
  const { clipId } = await params;
  const tokenHash = await tokenHashOr401();
  const { objectKey } = await rpc<{ objectKey: string }>("labeler_admin_playback", { tokenHash, clipId });
  const seconds = labelerConfig().playbackSeconds;
  const url = await objectStore().signGet(objectKey, seconds);
  return json({ url, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() });
});
