import { realpathSync } from "node:fs";
import type { ServerSpec, SkippedServer, Source } from "../types.js";
import type { ExpandContext } from "./expand.js";
import { parseJsonEntry } from "./entry.js";

export interface Parsed {
  servers: ServerSpec[];
  skipped: SkippedServer[];
}

function parseMap(map: unknown, source: Source, file: string, ctx: ExpandContext, out: Parsed): void {
  if (typeof map !== "object" || map === null) return;
  for (const [name, entry] of Object.entries(map as Record<string, unknown>)) {
    const r = parseJsonEntry(name, entry, source, file, ctx);
    if ("spec" in r) out.servers.push(r.spec);
    else out.skipped.push({ name, source, file, reason: r.skip });
  }
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * `.mcp.json` has only `mcpServers` (project scope). `~/.claude.json` has top-level
 * `mcpServers` (user scope) and `projects["<dir>"].mcpServers` (local scope).
 */
export function parseClaudeFile(json: unknown, file: string, ctx: ExpandContext): Parsed {
  const out: Parsed = { servers: [], skipped: [] };
  if (typeof json !== "object" || json === null) return out;
  const obj = json as Record<string, unknown>;
  const hasProjects = typeof obj["projects"] === "object" && obj["projects"] !== null;
  parseMap(obj["mcpServers"], hasProjects ? "claude-user" : "claude-project", file, ctx, out);
  if (hasProjects) {
    const projects = obj["projects"] as Record<string, unknown>;
    const real = realOrSelf(ctx.cwd);
    const key = Object.keys(projects).find((k) => k === ctx.cwd || k === real);
    const entry = key === undefined ? undefined : projects[key];
    if (typeof entry === "object" && entry !== null) {
      parseMap((entry as Record<string, unknown>)["mcpServers"], "claude-local", file, ctx, out);
    }
  }
  return out;
}
