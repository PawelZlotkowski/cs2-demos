// Local clip-labeller development on http://localhost:3100: the dev S3 stand-in on 127.0.0.1:9100
// plus `next dev` in RR_WEB_MODE=clip-labeller, configured from apps/web/.env.labeler.local
// (copy .env.labeler.example; use LABELER_DATABASE_URL for a disposable local Postgres).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const web = path.resolve(import.meta.dirname, "..");
const envFile = path.join(web, ".env.labeler.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.RR_WEB_MODE = "clip-labeller";
const site = process.env.LABELER_SITE_URL ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1):3100$/.test(site)) {
  console.error("Set LABELER_SITE_URL=http://localhost:3100 in apps/web/.env.labeler.local for local development.");
  process.exit(1);
}

const children = [];
if (process.env.R2_ENDPOINT?.startsWith("http://127.0.0.1:9100")) {
  children.push(spawn(process.execPath, [path.join(web, "scripts/dev-s3.mjs"), "9100", site], { stdio: "inherit" }));
}
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
children.push(spawn(process.execPath, [next, "dev", "-p", "3100"], { cwd: web, stdio: "inherit", env: process.env }));

const stop = () => children.forEach((child) => child.kill());
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
children.forEach((child) => child.on("exit", (code) => { stop(); process.exit(code ?? 0); }));
