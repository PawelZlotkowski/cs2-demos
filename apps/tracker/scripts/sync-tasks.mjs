// Parses docs/coach/TASKS.md into src/data/tasks.json.
// Runs before dev/build. If the markdown is not reachable (e.g. the deploy only
// uploads apps/tracker), the committed tasks.json is kept as is.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../../docs/coach/TASKS.md");
const target = resolve(here, "../src/data/tasks.json");

if (!existsSync(source)) {
  console.log(`[sync-tasks] ${source} not found, keeping committed tasks.json`);
  process.exit(0);
}

const lines = readFileSync(source, "utf8").split(/\r?\n/);
const phases = [];
let phase = null;
let header = null;

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

// Strip markdown links and code ticks for display.
const plain = (text) =>
  text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`([^`]*)`/g, "$1");

for (const line of lines) {
  const heading = line.match(/^##\s+Phase\s+(\d+)\s+[—-]\s+(.+)$/);
  if (heading) {
    phase = { id: Number(heading[1]), name: heading[2].trim(), tasks: [] };
    phases.push(phase);
    header = null;
    continue;
  }
  if (!phase || !line.trim().startsWith("|")) continue;
  const row = cells(line);
  if (row[0] === "ID") {
    header = row.map((h) => h.toLowerCase());
    continue;
  }
  if (!header || /^-+$/.test(row[0].replace(/:/g, ""))) continue;
  const get = (name) => row[header.indexOf(name)] ?? "";
  const depends = get("depends");
  phase.tasks.push({
    id: get("id"),
    title: plain(get("task")),
    depends: depends === "–" || depends === "-" ? [] : depends.match(/T\d+/g) ?? [],
    dependsNote: /go\/no-go/.test(depends) ? "go/no-go" : undefined,
    paths: plain(get("paths")),
    doneWhen: plain(get("done when")),
    size: get("size"),
    owner: get("owner"),
    status: get("status") || "todo",
  });
}

const total = phases.reduce((n, p) => n + p.tasks.length, 0);
writeFileSync(target, JSON.stringify({ source: "docs/coach/TASKS.md", phases }, null, 2) + "\n");
console.log(`[sync-tasks] wrote ${total} tasks in ${phases.length} phases`);
