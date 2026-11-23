import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";
import { cleanupCollection } from "@/lib/labeler/server/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aborts only this collection's unfinished uploads. Published media and reviews stay.
export const POST = route(async (_request, { params }: Params<"collectionId">) => {
  const { collectionId } = await params;
  const tokenHash = await tokenHashOr401();
  return json(await cleanupCollection(tokenHash, collectionId));
});
