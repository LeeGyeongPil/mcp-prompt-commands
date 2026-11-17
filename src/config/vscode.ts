import type { Parsed } from "./claude.js";
import type { ExpandContext } from "./expand.js";
import { parseJsonEntry } from "./entry.js";

/** `.vscode/mcp.json`: servers live under `servers` (not `mcpServers`). */
export function parseVscodeFile(json: unknown, file: string, ctx: ExpandContext): Parsed {
  const out: Parsed = { servers: [], skipped: [] };
  if (typeof json !== "object" || json === null) return out;
  const servers = (json as Record<string, unknown>)["servers"];
  if (typeof servers !== "object" || servers === null) return out;
  for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
    const r = parseJsonEntry(name, entry, "vscode", file, ctx);
    if ("spec" in r) out.servers.push(r.spec);
    else out.skipped.push({ name, source: "vscode", file, reason: r.skip });
  }
  return out;
}
