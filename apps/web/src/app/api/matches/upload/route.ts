// Demo uploads skip the /api rewrite in next.config.ts: a rewrite copies the whole request body
// into memory and cuts it at 10 MB, and demos are 100 to 400 MB. This handler streams the
// body to the API as it arrives, so the API's own size stop and magic-byte check still apply.

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const FORWARD = ["content-type", "content-length", "cookie", "authorization", "origin", "user-agent"];

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  // The API builds links and checks Origin against the host the browser used
  headers.set("x-forwarded-host", req.headers.get("host") ?? url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const ip = req.headers.get("x-forwarded-for");
  if (ip) headers.set("x-forwarded-for", ip);

  try {
    const res = await fetch(`${API}/matches/upload`, {
      method: "POST",
      headers,
      body: req.body,
      // Node's fetch needs this to send a streamed body
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The API is not reachable. Start it and try again." }, { status: 502 });
  }
}
