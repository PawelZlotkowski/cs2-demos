import type { NextConfig } from "next";

// The browser talks to the API through /api on the web app's own origin (doc 27 A00), so the
// session cookie is first-party and clips, uploads and Ask streams need no CORS. Rewrites are
// fixed at build time: in Docker the build sees API_INTERNAL_URL=http://api:8000. Demo uploads
// go through src/app/api/matches/upload/route.ts instead, which streams them.
const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compression would buffer the Ask tab's server-sent events
  compress: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
};

export default nextConfig;
