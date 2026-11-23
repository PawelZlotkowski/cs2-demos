import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401 } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const tokenHash = await tokenHashOr401();
  const search = request.nextUrl.searchParams;
  const filters: Record<string, string> = {};
  for (const key of ["collectionId", "accountId", "status"]) {
    const value = search.get(key);
    if (value) filters[key] = value;
  }
  return json(await rpc("labeler_admin_notes", { tokenHash, ...filters }));
});
