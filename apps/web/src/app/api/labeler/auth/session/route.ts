import { json, route } from "@/lib/labeler/server/http";
import { requireSession } from "@/lib/labeler/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { account } = await requireSession();
  return json({ account: { id: account.id, displayName: account.displayName, handle: account.handle, role: account.role } });
});
