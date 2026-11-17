import { UsageError } from "../errors.js";
import { discover, type Discovery } from "../config/discover.js";
import {
  AuthRequiredError,
  CODE_REQUEST_TIMEOUT,
  isLocalTransportError,
  NoPromptsError,
  PaginationError,
  ProtocolError,
  withServer,
  type PromptClient,
} from "../client.js";
import { render, type Lang, type Msg, type Translate } from "../i18n.js";
import { findByNameOrId, resolveNames } from "../names.js";
import type { Format, Mode, ServerSpec, SourceGroup } from "../types.js";

/** Parsed command-line options shared by all sub-commands. */
export interface Options {
  configs: string[];
  sources: SourceGroup[];
  servers: string[];
  timeoutMs: number;
  json: boolean;
  out: string;
  format: Format;
  mode: Mode;
  bin: string;
  dryRun: boolean;
  force: boolean;
  allowedTools: boolean;
  kv: string[];
  argsJson: string | undefined;
  argsLine: string | undefined;
  template: boolean;
  verbose: boolean;
  positionals: string[];
}

export interface Context {
  lang: Lang;
  t: Translate;
  cwd: string;
  home: string | undefined;
  env: Record<string, string | undefined>;
  opts: Options;
  out(text: string): void;
  err(text: string): void;
}

export function say(ctx: Context, msg: Msg): string {
  return render(ctx.lang, msg);
}

export function loadDiscovery(ctx: Context): Discovery {
  const d = discover({
    cwd: ctx.cwd,
    ...(ctx.home === undefined ? {} : { home: ctx.home }),
    configs: ctx.opts.configs,
    sources: ctx.opts.sources,
    env: ctx.env,
  });
  for (const w of d.warnings) ctx.err(`${ctx.t("label.warning")}: ${say(ctx, w)}`);
  return d;
}

/** The ids used in file names and `get` calls, resolved over all discovered servers. */
export function serverIds(d: Discovery): Map<string, string> {
  const resolved = resolveNames(d.servers.map((s) => s.name));
  return new Map(resolved.map((r) => [r.original, r.id]));
}

export function selectServers(ctx: Context, d: Discovery): ServerSpec[] {
  if (ctx.opts.servers.length === 0) return d.servers;
  const picked: ServerSpec[] = [];
  for (const q of ctx.opts.servers.flatMap((s) => s.split(",")).filter((s) => s !== "")) {
    const hit = findByNameOrId(d.servers, q);
    if (!hit) {
      throw new UsageError({
        key: "err.no_such_server",
        params: { name: q, available: d.servers.map((s) => s.name).join(", ") || "-" },
      });
    }
    if (!picked.includes(hit)) picked.push(hit);
  }
  return picked;
}

export type Outcome<T> =
  | { spec: ServerSpec; status: "ok"; value: T }
  | { spec: ServerSpec; status: "skipped" | "error"; reason: Msg };

/**
 * Why a connection failed, as a translatable message. The SDK and Node report these in
 * English; the facts that matter (command name, timeout, HTTP status) are kept, the sentence
 * comes from the catalog. Anything unknown is passed through as the raw text.
 */
export function connectReason(e: unknown, timeoutMs: number): Msg | string {
  const err = e as { code?: unknown; syscall?: unknown; path?: unknown; message?: unknown; cause?: unknown };
  if (err.code === "ENOENT" && typeof err.syscall === "string" && err.syscall.startsWith("spawn")) {
    return { key: "reason.command_not_found", params: { command: typeof err.path === "string" ? err.path : "?" } };
  }
  if (isLocalTransportError(e)) {
    return err.code === CODE_REQUEST_TIMEOUT
      ? { key: "reason.timeout", params: { ms: timeoutMs } }
      : { key: "reason.connection_closed" };
  }
  const causeCode = (err.cause as { code?: unknown } | undefined)?.code;
  if (typeof causeCode === "string" && /^(ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH)$/.test(causeCode)) {
    return { key: "reason.unreachable", params: { code: causeCode } };
  }
  if (typeof err.code === "number" && err.code >= 400 && err.code < 600) {
    return { key: "reason.http_status", params: { status: err.code } };
  }
  return typeof err.message === "string" ? err.message : String(e);
}

/** Maps an error from one server to "skipped" (not an error) or "error" with a translatable reason. */
export function failureOf(e: unknown, timeoutMs: number): { status: "skipped" | "error"; reason: Msg } {
  if (e instanceof NoPromptsError) return { status: "skipped", reason: { key: "skip.no_prompts" } };
  if (e instanceof AuthRequiredError) return { status: "skipped", reason: { key: "skip.auth" } };
  // The caller always shows the server name next to the reason, so the reason itself does not repeat it.
  if (e instanceof PaginationError) return { status: "error", reason: { key: "err.repeat_cursor" } };
  if (e instanceof ProtocolError) {
    return { status: "error", reason: { key: "err.server_protocol", params: { code: e.code, detail: e.message } } };
  }
  return { status: "error", reason: { key: "err.connect", params: { detail: connectReason(e, timeoutMs) } } };
}

/** Runs `fn` against every server in parallel; one failing server never hides the others. */
export async function runOnServers<T>(
  ctx: Context,
  specs: ServerSpec[],
  fn: (client: PromptClient, spec: ServerSpec) => Promise<T>,
): Promise<Outcome<T>[]> {
  return Promise.all(
    specs.map(async (spec): Promise<Outcome<T>> => {
      try {
        const value = await withServer(
          spec,
          { timeoutMs: ctx.opts.timeoutMs, verbose: ctx.opts.verbose, cwd: ctx.cwd },
          (client) => fn(client, spec),
        );
        return { spec, status: "ok", value };
      } catch (e) {
        return { spec, ...failureOf(e, ctx.opts.timeoutMs) };
      }
    }),
  );
}

export function describeTransport(spec: ServerSpec): string {
  if (spec.transport.kind === "stdio") return "stdio";
  try {
    return `http ${new URL(spec.transport.url).host}`;
  } catch {
    return "http";
  }
}

/** Terminal display width: Hangul, CJK and fullwidth forms take two columns. */
export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x20000 && c <= 0x3fffd);
    w += wide ? 2 : 1;
  }
  return w;
}

/** Plain text table: every column but the last is padded. */
export function table(rows: string[][]): string[] {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, displayWidth(cell))));
  return rows.map((row) =>
    row
      .map((cell, i) => (i === row.length - 1 ? cell : cell + " ".repeat((widths[i] ?? 0) - displayWidth(cell))))
      .join("  ")
      .trimEnd(),
  );
}

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
