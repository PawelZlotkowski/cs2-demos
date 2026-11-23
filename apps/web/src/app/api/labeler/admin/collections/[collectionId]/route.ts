import { z } from "zod";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_request, { params }: Params<"collectionId">) => {
  const { collectionId } = await params;
  const tokenHash = await tokenHashOr401();
  return json(await rpc("labeler_admin_collection", { tokenHash, collectionId }));
});

const patch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  })
  .strict();

export const PATCH = route(async (request, { params }: Params<"collectionId">) => {
  const { collectionId } = await params;
  const value = await readJson(request, patch, 2048);
  const tokenHash = await tokenHashOr401();
  return json(await rpc("labeler_admin_collection_update", { tokenHash, collectionId, ...value }));
});
