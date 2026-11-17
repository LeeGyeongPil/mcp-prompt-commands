import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { checkCommand } from "./commands/check.js";
import type { Context, Options } from "./commands/common.js";
import { generateCommand } from "./commands/generate.js";
import { getCommand } from "./commands/get.js";
import { listCommand } from "./commands/list.js";
import { EXIT_INTERNAL, EXIT_OK, EXIT_SERVER, EXIT_USAGE, ServerError, UsageError } from "./errors.js";
import { isLangFlag, resolveLang, translator, render, type Lang, type Msg } from "./i18n.js";
import type { Format, Mode, SourceGroup } from "./types.js";
import { VERSION } from "./version.js";

export interface Io {
  out(text: string): void;
  err(text: string): void;
}

const OPTIONS = {
  config: { type: "string", multiple: true },
  source: { type: "string" },
  server: { type: "string", multiple: true },
  cwd: { type: "string" },
  home: { type: "string" },
  out: { type: "string" },
  format: { type: "string" },
  mode: { type: "string" },
  bin: { type: "string" },
  "no-allowed-tools": { type: "boolean" },
  "dry-run": { type: "boolean" },
  force: { type: "boolean" },
  arg: { type: "string", multiple: true },
  "args-json": { type: "string" },
  "args-line": { type: "string" },
  template: { type: "boolean" },
  timeout: { type: "string" },
  json: { type: "boolean" },
  verbose: { type: "boolean" },
  lang: { type: "string" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

const COMMANDS = ["list", "generate", "get", "check"];

function oneOf<T extends string>(option: string, value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new UsageError({ key: "err.bad_value", params: { option, value, allowed: allowed.join(" | ") } });
}

function parseTimeout(value: string | undefined, envValue: string | undefined): number {
  const raw = value ?? envValue;
  if (raw === undefined || raw === "") return 10000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError({ key: "err.bad_timeout", params: { value: raw } });
  return n;
}

/**
 * Turns a node:util parseArgs error into a translatable message. Node's own text is English,
 * so only the option name is taken from it.
 */
function optionError(e: unknown): UsageError {
  const code = (e as { code?: unknown }).code;
  const message = (e as Error)?.message ?? "";
  const quoted = /'([^']+)'/.exec(message)?.[1]?.replace(/\s*<value>$/, "");
  if (quoted !== undefined) {
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") return new UsageError({ key: "err.unknown_option", params: { option: quoted } });
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
      return /argument missing/.test(message)
        ? new UsageError({ key: "err.option_needs_value", params: { option: quoted } })
        : new UsageError({ key: "err.option_takes_no_value", params: { option: quoted } });
    }
  }
  return new UsageError({ key: "err.bad_option", params: { detail: message.split("\n")[0] ?? "" } });
}

type Token = NonNullable<ReturnType<typeof parseArgs>["tokens"]>[number];

/**
 * Stray values after list/generate/check. The usual cause is an unquoted option value with a
 * space (`--bin node dist/cli.js`): the shell splits it and `dist/cli.js` would be silently
 * dropped. Name the stray values and, when they follow an option value, show the quoted form.
 */
function extraArgsError(command: string, tokens: Token[]): UsageError {
  const positionals = tokens.filter((t) => t.kind === "positional").slice(1); // [0] is the command
  const values = positionals.map((t) => (t.kind === "positional" ? t.value : "")).join(" ");
  const first = positionals[0];
  const at = first ? tokens.indexOf(first) : -1;
  const prev = at > 0 ? tokens[at - 1] : undefined;
  if (prev && prev.kind === "option" && prev.value !== undefined && !prev.inlineValue) {
    // 옵션 값 바로 뒤에 이어진 위치 인자들 = 공백 때문에 잘린 같은 값으로 본다.
    const parts = [prev.value];
    for (let i = at; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (!t || t.kind !== "positional") break;
      parts.push(t.value);
    }
    return new UsageError({
      key: "err.extra_args_quote",
      params: { command, values, option: prev.rawName, value: parts.join(" ") },
    });
  }
  return new UsageError({ key: "err.extra_args", params: { command, values } });
}

/** Runs the CLI and returns the exit code. Nothing in here calls process.exit. */
export async function main(argv: string[], env: Record<string, string | undefined>, io: Io): Promise<number> {
  // The language is needed to report even option errors, so look at --lang before full parsing.
  const langIdx = argv.findIndex((a) => a === "--lang" || a.startsWith("--lang="));
  let langFlag: string | undefined;
  if (langIdx !== -1) {
    const a = argv[langIdx] ?? "";
    langFlag = a.includes("=") ? a.slice(a.indexOf("=") + 1) : argv[langIdx + 1];
  }
  let lang: Lang = resolveLang(langFlag && isLangFlag(langFlag) ? langFlag : undefined, env);
  const show = (msg: Msg): string => render(lang, msg);

  try {
    if (langFlag !== undefined && !isLangFlag(langFlag)) {
      throw new UsageError({ key: "err.bad_lang", params: { value: langFlag } });
    }
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true, tokens: true });
    } catch (e) {
      throw optionError(e);
    }
    const v = parsed.values;
    lang = resolveLang(v.lang, env);
    const t = translator(lang);

    if (v.version) {
      io.out(VERSION);
      return EXIT_OK;
    }
    const [command, ...rest] = parsed.positionals;
    if (v.help || command === undefined || command === "help") {
      io.out(t("help.text"));
      return command === undefined && !v.help ? EXIT_USAGE : EXIT_OK;
    }
    if (!COMMANDS.includes(command)) throw new UsageError({ key: "err.unknown_command", params: { name: command } });
    // list·generate·check take no positional values; `get` passes its extra values to the prompt
    // (and buildArguments rejects more values than the prompt has arguments).
    if (command !== "get" && rest.length > 0) throw extraArgsError(command, parsed.tokens ?? []);

    const sources = (v.source ?? "claude,vscode,codex")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    for (const s of sources) oneOf("--source", s, ["claude", "vscode", "codex"] as const, "claude");

    const opts: Options = {
      configs: v.config ?? [],
      sources: sources as SourceGroup[],
      servers: v.server ?? [],
      timeoutMs: parseTimeout(v.timeout, env["MCP_TIMEOUT"]),
      json: v.json === true,
      out: v.out ?? ".claude",
      format: oneOf<Format>("--format", v.format, ["commands", "skills"], "commands"),
      mode: oneOf<Mode>("--mode", v.mode, ["live", "static", "agent"], "live"),
      bin: v.bin ?? "mcp-prompt-commands",
      dryRun: v["dry-run"] === true,
      force: v.force === true,
      allowedTools: v["no-allowed-tools"] !== true,
      kv: v.arg ?? [],
      argsJson: v["args-json"],
      argsLine: v["args-line"],
      template: v.template === true,
      verbose: v.verbose === true,
      positionals: rest,
    };
    const ctx: Context = {
      lang,
      t,
      cwd: resolve(v.cwd ?? process.cwd()),
      home: v.home === undefined ? undefined : resolve(v.home),
      env,
      opts,
      out: (text) => io.out(text),
      err: (text) => io.err(text),
    };

    switch (command) {
      case "list":
        return await listCommand(ctx);
      case "generate":
        return await generateCommand(ctx);
      case "get":
        return await getCommand(ctx);
      default:
        return await checkCommand(ctx);
    }
  } catch (e) {
    const t = translator(lang);
    if (e instanceof UsageError) {
      io.err(`${t("label.error")}: ${show(e.msg)}`);
      return EXIT_USAGE;
    }
    if (e instanceof ServerError) {
      io.err(`${t("label.error")}: ${show(e.msg)}`);
      return EXIT_SERVER;
    }
    io.err(`${t("label.error")}: ${(e as Error)?.stack ?? String(e)}`);
    return EXIT_INTERNAL;
  }
}
