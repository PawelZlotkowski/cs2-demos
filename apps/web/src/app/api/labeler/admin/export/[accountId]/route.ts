import { NextResponse } from "next/server";
import { rpc } from "@/lib/labeler/server/db";
import { buildNotesExport, type ExportRaw } from "@/lib/labeler/server/export";
import { tokenHashOr401, type Params } from "@/lib/labeler/server/guard";
import { NO_STORE, route } from "@/lib/labeler/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One round-reviewer-notes-v1 file per reviewer, for the local "Import notes" action.
export const GET = route(async (_request, { params }: Params<"accountId">) => {
  const { accountId } = await params;
  const tokenHash = await tokenHashOr401();
  const raw = await rpc<ExportRaw>("labeler_admin_export", { tokenHash, accountId });
  const payload = buildNotesExport(raw, new Date().toISOString());
  return new NextResponse(JSON.stringify(payload), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="round-reviewer-notes-${raw.account.handle}.json"`,
    },
  });
});
