import { z } from "zod";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ accountId: z.string().uuid(), assigned: z.boolean() }).strict();

export const POST = route(async (request, { params }: Params<"collectionId">) => {
  const { collectionId } = await params;
  const value = await readJson(request, body, 1024);
  const tokenHash = await tokenHashOr401();
  return json(await rpc("labeler_admin_assign", { tokenHash, collectionId, ...value }));
});
