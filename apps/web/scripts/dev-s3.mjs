// Local development stand-in for the few S3 operations the clip labeller uses, so the browser
// upload and playback flow can be exercised on localhost without touching Cloudflare R2.
// It ignores signatures; never expose it beyond 127.0.0.1. Real deployments use R2.
//
//   node scripts/dev-s3.mjs [port] [allowed-origin]
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const port = Number(process.argv[2] ?? 9100);
const origin = process.argv[3] ?? "http://localhost:3100";
// Completed objects persist in a temp folder so restarting the dev server keeps uploaded clips.
const folder = path.join(os.tmpdir(), "rr-labeller-dev-s3");
mkdirSync(folder, { recursive: true });
const file = (key) => path.join(folder, encodeURIComponent(key));
const objects = {
  has: (key) => existsSync(file(key)),
  get: (key) => (existsSync(file(key)) ? { body: readFileSync(file(key)), type: readFileSync(file(key) + ".type", "utf8") } : undefined),
  set: (key, value) => { writeFileSync(file(key), value.body); writeFileSync(file(key) + ".type", value.type); },
  delete: (key) => { rmSync(file(key), { force: true }); rmSync(file(key) + ".type", { force: true }); },
};
const uploads = new Map(); // id -> { key, type, parts: Map<number, Buffer> }

const md5 = (body) => `"${createHash("md5").update(body).digest("hex")}"`;
const xml = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/xml" });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
};
const error = (res, status, code) => xml(res, status, `<Error><Code>${code}</Code><Message>${code}</Message></Error>`);

function cors(req, res) {
  if (req.headers.origin === origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Expose-Headers", "ETag, Content-Length, Content-Range, Accept-Ranges");
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const [, bucket, ...rest] = url.pathname.split("/");
  const key = decodeURIComponent(rest.join("/"));
  const q = url.searchParams;
  cors(req, res);
  if (req.method === "OPTIONS") {
    if (req.headers.origin !== origin) return error(res, 403, "CORSForbidden");
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, HEAD, PUT",
      "Access-Control-Allow-Headers": req.headers["access-control-request-headers"] ?? "*",
      "Access-Control-Max-Age": "3600",
    });
    return res.end();
  }
  // Presigned URLs expire like R2's (403 ExpiredRequest, without CORS headers on the error).
  const date = q.get("X-Amz-Date");
  const expires = Number(q.get("X-Amz-Expires"));
  if (date && expires) {
    const signedAt = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +date.slice(9, 11), +date.slice(11, 13), +date.slice(13, 15));
    if (Date.now() > signedAt + expires * 1000) {
      res.removeHeader("Access-Control-Allow-Origin");
      return error(res, 403, "ExpiredRequest");
    }
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (!bucket || !key) return error(res, 400, "InvalidRequest");
    if (req.method === "POST" && q.has("uploads")) {
      const id = randomUUID();
      uploads.set(id, { key, type: req.headers["content-type"] ?? "application/octet-stream", parts: new Map() });
      return xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (req.method === "PUT" && q.has("uploadId")) {
      const upload = uploads.get(q.get("uploadId"));
      if (!upload || upload.key !== key) return error(res, 404, "NoSuchUpload");
      upload.parts.set(Number(q.get("partNumber")), body);
      res.writeHead(200, { ETag: md5(body) });
      return res.end();
    }
    if (req.method === "GET" && q.has("uploadId")) {
      const upload = uploads.get(q.get("uploadId"));
      if (!upload || upload.key !== key) return error(res, 404, "NoSuchUpload");
      const parts = [...upload.parts.entries()].sort((a, b) => a[0] - b[0])
        .map(([n, b]) => `<Part><PartNumber>${n}</PartNumber><ETag>${md5(b)}</ETag><Size>${b.length}</Size></Part>`).join("");
      return xml(res, 200, `<ListPartsResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${q.get("uploadId")}</UploadId><IsTruncated>false</IsTruncated>${parts}</ListPartsResult>`);
    }
    if (req.method === "POST" && q.has("uploadId")) {
      const upload = uploads.get(q.get("uploadId"));
      if (!upload || upload.key !== key) return error(res, 404, "NoSuchUpload");
      if (req.headers["if-none-match"] === "*" && objects.has(key)) return error(res, 412, "PreconditionFailed");
      const numbers = [...body.toString().matchAll(/<PartNumber>(\d+)<\/PartNumber>/g)].map((m) => Number(m[1]));
      const parts = numbers.map((n) => upload.parts.get(n));
      if (parts.some((p) => !p)) return error(res, 400, "InvalidPart");
      if (parts.slice(0, -1).some((p) => p.length !== parts[0].length || p.length < 5 * 1024 * 1024)) return error(res, 400, "InvalidPart");
      objects.set(key, { body: Buffer.concat(parts), type: upload.type });
      uploads.delete(q.get("uploadId"));
      return xml(res, 200, `<CompleteMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>"done-${parts.length}"</ETag></CompleteMultipartUploadResult>`);
    }
    if (req.method === "DELETE" && q.has("uploadId")) {
      uploads.delete(q.get("uploadId"));
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204);
      return res.end();
    }
    const object = objects.get(key);
    if (req.method === "HEAD" || req.method === "GET") {
      if (!object) {
        if (req.method === "HEAD") { res.writeHead(404); return res.end(); }
        return error(res, 404, "NoSuchKey");
      }
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = range && range[2] ? Math.min(Number(range[2]), object.body.length - 1) : object.body.length - 1;
      const headers = { "Content-Type": object.type, "Accept-Ranges": "bytes", ETag: md5(object.body), "Content-Length": String(end - start + 1) };
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${object.body.length}`;
      res.writeHead(range ? 206 : 200, headers);
      return res.end(req.method === "HEAD" ? undefined : object.body.subarray(start, end + 1));
    }
    return error(res, 405, "MethodNotAllowed");
  });
});

server.listen(port, "127.0.0.1", () => console.log(`dev S3 stand-in on http://127.0.0.1:${port} for ${origin}`));
