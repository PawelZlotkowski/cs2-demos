import { NextResponse } from "next/server";
import { clearEdit, readEdits, sharedStorage, writeEdit } from "@/lib/store";
import { isStatus, taskIds, type TaskEdit } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const passcode = process.env.TRACKER_PASSCODE || "";

export async function GET() {
  if (!sharedStorage) {
    return NextResponse.json({ mode: "local", edits: {}, passcodeRequired: false });
  }
  try {
    const edits = await readEdits();
    return NextResponse.json({ mode: "shared", edits, passcodeRequired: Boolean(passcode) });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

export async function POST(request: Request) {
  if (!sharedStorage) {
    return NextResponse.json({ error: "Shared storage is not configured" }, { status: 409 });
  }
  if (passcode && request.headers.get("x-tracker-passcode") !== passcode) {
    return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = clip(body?.id, 8);
  if (!id || !taskIds.has(id)) {
    return NextResponse.json({ error: "Unknown task" }, { status: 400 });
  }

  try {
    if (body?.reset === true) {
      await clearEdit(id);
      return NextResponse.json({ ok: true, id, edit: null });
    }
    if (body?.status !== undefined && !isStatus(body.status)) {
      return NextResponse.json({ error: "Bad status" }, { status: 400 });
    }
    const edit: TaskEdit = {
      owner: clip(body?.owner, 40),
      status: body?.status as TaskEdit["status"],
      note: clip(body?.note, 500),
      updatedBy: clip(body?.updatedBy, 40),
      updatedAt: new Date().toISOString(),
    };
    await writeEdit(id, edit);
    return NextResponse.json({ ok: true, id, edit });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
