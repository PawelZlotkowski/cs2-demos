import { labelerConfig } from "@/lib/labeler/server/config";
import { rpc } from "@/lib/labeler/server/db";
import { tokenHashOr401 } from "@/lib/labeler/server/guard";
import { json, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const tokenHash = await tokenHashOr401();
  const overview = await rpc<Record<string, unknown>>("labeler_admin_overview", { tokenHash });
  const config = labelerConfig();
  return json({
    ...overview,
    limits: { ...config.limits },
    bucket: config.r2.bucket,
    siteOrigin: config.siteOrigin,
  });
});
