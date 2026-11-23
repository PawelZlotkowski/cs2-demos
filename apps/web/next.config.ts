import type { NextConfig } from "next";

// The browser talks to the API through /api on the web app's own origin (doc 27 A00), so the
// session cookie is first-party and clips, uploads and Ask streams need no CORS. Rewrites are
// fixed at build time: in Docker the build sees API_INTERNAL_URL=http://api:8000. Demo uploads
// go through src/app/api/matches/upload/route.ts instead, which streams them.
const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

// RR_WEB_MODE=clip-labeller builds the hosted clip labeller (Vercel). It has no local Python
// API: the /api rewrite is off and /api/labeler/* are Next.js route handlers. Unset, the Studio
// builds exactly as before.
const LABELLER = process.env.RR_WEB_MODE === "clip-labeller";

const labellerHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Compression would buffer the Ask tab's server-sent events
  compress: false,
  // Inlined at build time so the layout, middleware and client agree on the mode.
  env: { RR_WEB_MODE: process.env.RR_WEB_MODE ?? "" },
  serverExternalPackages: ["pg"],
  async rewrites() {
    if (LABELLER) return [];
    return [{ source: "/api/:path*", destination: `${API}/:path*` }];
  },
  async headers() {
    if (!LABELLER) return [];
    return [{ source: "/:path*", headers: labellerHeaders }];
  },
};

export default nextConfig;
