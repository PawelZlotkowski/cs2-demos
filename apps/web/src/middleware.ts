import { NextResponse, type NextRequest } from "next/server";

/**
 * Route gating by build mode. In clip-labeller mode only /label/* and /api/labeler/* exist
 * (plus static assets); Studio routes redirect to the labeller and other /api paths answer
 * 404. In Studio mode (RR_WEB_MODE unset) the labeller routes do not exist and nothing else
 * changes. Authentication is checked by the pages and route handlers, not here.
 */
export function middleware(request: NextRequest) {
  const labeller = process.env.RR_WEB_MODE === "clip-labeller";
  const path = request.nextUrl.pathname;
  const labelPath = path === "/label" || path.startsWith("/label/");
  const labelApi = path === "/api/labeler" || path.startsWith("/api/labeler/");

  if (labeller) {
    if (labelPath || labelApi) return NextResponse.next();
    if (path.startsWith("/api/")) {
      return NextResponse.json({ detail: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/label";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (labelPath || labelApi) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // The demo upload stays outside middleware: Next copies a request body for middleware and
  // cuts that copy at 10 MB, so real demos would reach the upload route truncated.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|api/matches/upload).*)"],
};
