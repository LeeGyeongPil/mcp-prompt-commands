import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileReason, jsonReason, tomlReason, UsageError } from "../errors.js";
import type { Msg } from "../i18n.js";
import type { ServerSpec, SkippedServer, Source, SourceGroup } from "../types.js";
import { parseClaudeFile, type Parsed } from "./claude.js";
import { parseCodexToml } from "./codex.js";
import type { ExpandContext } from "./expand.js";
import { parseVscodeFile } from "./vscode.js";

export interface DiscoverOptions {
  cwd: string;
  home?: string;
  /** Explicit config files. When given, only these files are read. */
  configs?: string[];
  sources?: SourceGroup[];
  env?: Record<string, string | undefined>;
}

export interface Discovery {
  servers: ServerSpec[];
  skipped: SkippedServer[];
  files: string[];
  /** Unreadable default config files: reported, but they do not stop the other sources. */
  warnings: Msg[];
}

/** Lower rank wins when two sources define the same server name. */
const RANK: Record<Source, number> = {
  "claude-local": 0,
  "claude-project": 1,
  vscode: 2,
  "claude-user": 3,
  codex: 4,
};

/**
 * A config file that cannot be read or parsed. `reason` is a translatable message (permission
 * denied, invalid JSON at line 3 column 5, ...), so the same reason can be shown either as a
 * fatal error (--config) or as a warning (default files) in the user's language.
 */
export class ConfigReadError extends UsageError {
  readonly reason: Msg;
  constructor(file: string, reason: Msg) {
    super({ key: "err.config_parse", params: { file, detail: reason } });
    this.reason = reason;
  }
}

function readText(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch (e) {
    throw new ConfigReadError(file, fileReason(e));
  }
}

function readJson(file: string): unknown {
  const text = readText(file);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new ConfigReadError(file, jsonReason(e, text));
  }
}

function readCodex(file: string, ctx: ExpandContext): Parsed {
  const text = readText(file);
  try {
    return parseCodexToml(text, file, ctx);
  } catch (e) {
    throw new ConfigReadError(file, tomlReason(e));
  }
}

function readExplicit(file: string, ctx: ExpandContext): Parsed {
  if (!existsSync(file)) throw new UsageError({ key: "err.config_missing", params: { file } });
  if (extname(file).toLowerCase() === ".toml") return readCodex(file, ctx);
  const json = readJson(file);
  if (typeof json === "object" && json !== null) {
    const o = json as Record<string, unknown>;
    if ("mcpServers" in o || "projects" in o) return parseClaudeFile(json, file, ctx);
    if ("servers" in o) return parseVscodeFile(json, file, { ...ctx, vscode: true });
  }
  throw new UsageError({ key: "err.config_format", params: { file } });
}

/** Reads MCP server definitions from existing client configs. Never writes anything. */
export function discover(opts: DiscoverOptions): Discovery {
  const env = opts.env ?? process.env;
  const cwd = resolve(opts.cwd);
  const home = resolve(opts.home ?? homedir());
  const ctx: ExpandContext = { env, cwd, vscode: false };
  const wanted = new Set<SourceGroup>(opts.sources ?? ["claude", "vscode", "codex"]);
  const parts: Parsed[] = [];
  const files: string[] = [];
  const warnings: Msg[] = [];
  /** Default sources are best effort; only files named with --config are fatal. */
  const tryRead = (file: string, read: () => Parsed): void => {
    try {
      const parsed = read();
      files.push(file);
      parts.push(parsed);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      // 경고에는 "--config 를 바꾸라" 는 치명 오류용 안내 대신 원인만 현재 언어로 싣는다.
      const detail = e instanceof ConfigReadError ? e.reason : e.msg;
      warnings.push({ key: "warn.config_unreadable", params: { file, detail } });
    }
  };

  if (opts.configs && opts.configs.length > 0) {
    for (const c of opts.configs) {
      const file = resolve(cwd, c);
      files.push(file);
      parts.push(readExplicit(file, ctx));
    }
  } else {
    const claudeUser = join(home, ".claude.json");
    const claudeProject = join(cwd, ".mcp.json");
    const vscode = join(cwd, ".vscode", "mcp.json");
    const codexHome = env["CODEX_HOME"] ? resolve(cwd, env["CODEX_HOME"]) : join(home, ".codex");
    const codex = join(codexHome, "config.toml");
    if (wanted.has("claude")) {
      for (const f of [claudeProject, claudeUser]) {
        if (!existsSync(f)) continue;
        tryRead(f, () => parseClaudeFile(readJson(f), f, ctx));
      }
    }
    if (wanted.has("vscode") && existsSync(vscode)) {
      tryRead(vscode, () => parseVscodeFile(readJson(vscode), vscode, { ...ctx, vscode: true }));
    }
    if (wanted.has("codex") && existsSync(codex)) {
      tryRead(codex, () => readCodex(codex, ctx));
    }
  }

  const all = parts.flatMap((p) => p.servers).sort((a, b) => RANK[a.source] - RANK[b.source]);
  const skipped = parts.flatMap((p) => p.skipped);
  const servers: ServerSpec[] = [];
  const seen = new Map<string, ServerSpec>();
  for (const s of all) {
    const winner = seen.get(s.name);
    if (winner) {
      skipped.push({
        name: s.name,
        source: s.source,
        file: s.file,
        reason: { key: "skip.shadowed", params: { source: winner.source } },
      });
      continue;
    }
    seen.set(s.name, s);
    servers.push(s);
  }
  servers.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { servers, skipped, files, warnings };
}
