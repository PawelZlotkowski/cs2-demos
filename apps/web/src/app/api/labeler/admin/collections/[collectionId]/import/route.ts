import { importBatchSchema } from "@/lib/labeler/manifest";
import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Small manifest batches only (well under Vercel's 4.5 MB body limit); MP4 bytes go to R2.
export const POST = route(async (request, { params }: Params<"collectionId">) => {
  const { collectionId } = await params;
  const batch = await readJson(request, importBatchSchema, 1024 * 1024);
  const tokenHash = await tokenHashOr401();
  const config = labelerConfig();
  const clips = batch.clips.map((clip) => ({
    footageId: clip.footageId,
    sha256: clip.sha256,
    bytes: clip.bytes,
    matchId: clip.matchId,
    playerId: clip.playerId,
    snapshotId: clip.snapshotId,
    round: clip.round,
    findingId: clip.finding.id,
    // Private source context, immutable once stored; never returned to reviewers.
    context: { finding: clip.finding, footage: clip.footage, batchId: clip.batchId },
  }));
  const used = new Set(clips.map((clip) => clip.matchId));
  const demos = Object.fromEntries(Object.entries(batch.demos).filter(([id]) => used.has(id)));
  return json(
    await rpc("labeler_admin_import", {
      tokenHash,
      collectionId,
      demos,
      clips,
      maxClips: config.limits.maxClips,
      maxClipBytes: config.limits.maxClipBytes,
    }),
  );
});
