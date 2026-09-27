/// <reference types="vite/client" />

// apps/web/src/lib/api/client.ts reads these; vite.config.ts defines them at build time.
declare const process: { env: Record<string, string | undefined> };
