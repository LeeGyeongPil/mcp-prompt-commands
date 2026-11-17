import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";

/** Repository root (this file runs from dist-test/test/). */
export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const STDIO_SERVER = join(ROOT, "test", "fixtures", "servers", "stdio.mjs");
export const HTTP_SERVER = join(ROOT, "test", "fixtures", "servers", "http.mjs");
export const CLI = join(ROOT, "dist-test", "src", "cli.js");
export const FIXTURES = join(ROOT, "test", "fixtures", "configs");

export function tmpDir(t: TestContext, name = "mpc"): string {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Environment for CLI runs: never the real home, English output, fixture server path. */
export function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env["PATH"] ?? "",
    HOME: tmpdir(),
    MCP_PROMPT_COMMANDS_LANG: "en",
    MOCK_STDIO: STDIO_SERVER,
    ...extra,
  };
}

export function runCli(args: string[], opts: { cwd: string; env?: Record<string, string> }): CliResult {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: opts.cwd,
    env: baseEnv(opts.env),
    encoding: "utf8",
    timeout: 60000,
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

/** Writes a Claude-style config with one stdio server "mock" backed by the fixture server. */
export function writeStdioConfig(
  dir: string,
  variant = "",
  extraEnv: Record<string, string> = {},
  fileName = "servers.json",
): string {
  const file = join(dir, fileName);
  const config = {
    mcpServers: {
      mock: { command: "node", args: [STDIO_SERVER], env: { MOCK_VARIANT: variant, ...extraEnv } },
    },
  };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

export interface HttpFixture {
  url: string;
  stop(): void;
}

/** Starts the HTTP fixture server on a free localhost port. */
export async function startHttp(t: TestContext, env: Record<string, string> = {}): Promise<HttpFixture> {
  const child: ChildProcess = spawn(process.execPath, [HTTP_SERVER], {
    env: { PATH: process.env["PATH"] ?? "", ...env },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const stop = (): void => {
    child.kill("SIGTERM");
  };
  t.after(stop);
  const port = await new Promise<number>((resolve, reject) => {
    let buf = "";
    child.stdout?.on("data", (d: Buffer) => {
      buf += d.toString();
      const m = /listening (\d+)/.exec(buf);
      if (m) resolve(Number(m[1]));
    });
    child.on("exit", () => reject(new Error("http fixture exited early")));
    setTimeout(() => reject(new Error("http fixture did not start")), 15000).unref();
  });
  return { url: `http://127.0.0.1:${port}/mcp`, stop };
}

/** Every file under dir with its content hash-free snapshot (path -> "size:mtimeMs:content"). */
export function snapshotTree(dir: string, skip: (rel: string) => boolean = () => false): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const rel = relative(dir, p);
      if (skip(rel)) continue;
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else out[rel] = `${st.size}:${st.mtimeMs}:${readFileSync(p, "utf8")}`;
    }
  };
  walk(dir);
  return out;
}

export function listFiles(dir: string): string[] {
  return Object.keys(snapshotTree(dir)).sort();
}

export function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Splits an argument string with shell-style quotes (the rule the Claude Code docs describe). */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

export interface Simulation {
  frontmatter: string;
  body: string;
  /** Shell commands that were found in the original file (and run through `run`). */
  commands: string[];
}

/**
 * Simulates how Claude Code renders a command file, following its documentation
 * (https://code.claude.com/docs/en/slash-commands): one pass over the original text;
 * `!`cmd`` and ```! blocks run a shell command and are replaced by its output; `$0`-style
 * indexes start at 0; `$name` comes from the `arguments:` list; argument values are inserted
 * as literal text and never re-scanned; `\$` escapes a literal dollar.
 */
export function simulate(file: string, argString: string, run: (cmd: string) => string = () => ""): Simulation {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(file);
  const frontmatter = m?.[1] ?? "";
  const text = m?.[2] ?? file;
  const list = /^arguments: \[(.*)\]$/m.exec(frontmatter)?.[1] ?? "";
  const names = list.split(",").map((s) => s.trim()).filter(Boolean);
  const args = tokenize(argString);
  const alt = names.length > 0 ? `|${names.join("|")}` : "";
  const re = new RegExp(
    [
      `\\\\\\$(?=\\d|ARGUMENTS${alt})`, // 1: escaped dollar
      "(?<!\\S)```!\\n([\\s\\S]*?)\\n```", // 2: fenced shell block
      "(?<!\\S)!`([^`\\n]+)`", // 3: inline shell command
      "\\$ARGUMENTS\\[(\\d+)\\]", // 4
      "\\$ARGUMENTS", // 5
      "\\$(\\d+)", // 6
      `\\$(${names.length > 0 ? names.join("|") : "(?!)"})(?![A-Za-z0-9_])`, // 7
    ].join("|"),
    "g",
  );
  const commands: string[] = [];
  const body = text.replace(re, (whole: string, ...g: (string | undefined)[]) => {
    if (whole === "\\$") return "$";
    const fence = g[0];
    const inline = g[1];
    if (fence !== undefined || inline !== undefined) {
      const cmd = (fence ?? inline) as string;
      commands.push(cmd);
      return run(cmd);
    }
    if (g[2] !== undefined) return args[Number(g[2])] ?? whole;
    if (whole === "$ARGUMENTS") return argString;
    if (g[3] !== undefined) return args[Number(g[3])] ?? whole;
    const idx = names.indexOf(g[4] ?? "");
    return args[idx] ?? "";
  });
  return { frontmatter, body, commands };
}
