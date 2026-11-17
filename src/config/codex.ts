import { parse as parseToml } from "smol-toml";
import type { Parsed } from "./claude.js";
import { Expander } from "./entry.js";
import type { ExpandContext } from "./expand.js";

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(v)) for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

/** Codex `config.toml`: `[mcp_servers.<name>]` with `command/args/env` or `url` + `bearer_token_env_var`. */
export function parseCodexToml(text: string, file: string, ctx: ExpandContext): Parsed {
  const out: Parsed = { servers: [], skipped: [] };
  const doc = parseToml(text) as Json;
  const servers = doc["mcp_servers"];
  if (!isObject(servers)) return out;
  for (const [name, raw] of Object.entries(servers)) {
    const skip = (key: "skip.invalid_entry" | "skip.disabled" | "skip.no_command_or_url" | "skip.unset_var", params?: Record<string, string>) =>
      out.skipped.push({ name, source: "codex", file, reason: params ? { key, params } : { key } });
    if (!isObject(raw)) {
      skip("skip.invalid_entry");
      continue;
    }
    if (raw["enabled"] === false) {
      skip("skip.disabled");
      continue;
    }
    const x = new Expander(ctx);
    if (typeof raw["command"] === "string") {
      const env = x.map(stringMap(raw["env"]));
      // env_vars lists variable names to pass through from the current environment.
      for (const v of strings(raw["env_vars"])) {
        const val = ctx.env[v];
        if (val !== undefined) env[v] = val;
      }
      const transport = {
        kind: "stdio" as const,
        command: x.str(raw["command"]),
        args: strings(raw["args"]).map((a) => x.str(a)),
        env,
        ...(typeof raw["cwd"] === "string" ? { cwd: x.str(raw["cwd"]) } : {}),
      };
      const problem = x.problem();
      if (problem) out.skipped.push({ name, source: "codex", file, reason: problem });
      else out.servers.push({ name, source: "codex", file, transport });
    } else if (typeof raw["url"] === "string") {
      const headers = x.map(stringMap(raw["http_headers"]));
      const tokenVar = raw["bearer_token_env_var"];
      if (typeof tokenVar === "string") {
        const token = ctx.env[tokenVar];
        if (token === undefined) {
          skip("skip.unset_var", { vars: tokenVar });
          continue;
        }
        headers["Authorization"] = `Bearer ${token}`;
      }
      const transport = { kind: "http" as const, url: x.str(raw["url"]), headers };
      const problem = x.problem();
      if (problem) out.skipped.push({ name, source: "codex", file, reason: problem });
      else out.servers.push({ name, source: "codex", file, transport });
    } else {
      skip("skip.no_command_or_url");
    }
  }
  return out;
}
