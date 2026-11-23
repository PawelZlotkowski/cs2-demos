import { z } from "zod";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401 } from "@/lib/labeler/server/guard";
import { json, readJson, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ name: z.string().trim().min(1).max(120) }).strict();

export const POST = route(async (request) => {
  const { name } = await readJson(request, body, 2048);
  const tokenHash = await tokenHashOr401();
  return json(await rpc("labeler_admin_collection_create", { tokenHash, name }), { status: 201 });
});
