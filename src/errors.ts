import { render, type Msg } from "./i18n.js";

export const EXIT_OK = 0;
export const EXIT_DRIFT = 1;
export const EXIT_USAGE = 2;
export const EXIT_SERVER = 3;
export const EXIT_INTERNAL = 4;

/** A problem the user can fix by changing the command line or a config file (exit 2). */
export class UsageError extends Error {
  readonly msg: Msg;
  constructor(msg: Msg) {
    // .message is English for stack traces only; users always see `msg` rendered in their language.
    super(render("en", msg));
    this.msg = msg;
  }
}

/** A server could not be reached or answered with a protocol error (exit 3). */
export class ServerError extends Error {
  readonly msg: Msg;
  readonly code: number | undefined;
  constructor(msg: Msg, code?: number) {
    super(render("en", msg));
    this.msg = msg;
    this.code = code;
  }
}

// ---- Reasons: turn a low-level error into a translatable message ----
// Low-level errors (file system, JSON/TOML parser, MCP SDK) carry English text. Each helper
// below picks the useful facts (error code, line, column, command name) and puts them into a
// catalog message, so the reason reads naturally in Korean output too.

/** Why a file could not be read (permission, not a file, ...). */
export function fileReason(e: unknown): Msg {
  const code = (e as { code?: unknown }).code;
  if (code === "EACCES" || code === "EPERM") return { key: "reason.permission_denied" };
  if (code === "EISDIR") return { key: "reason.is_directory" };
  if (code === "ENOENT") return { key: "reason.not_found" };
  return { key: "reason.os_error", params: { code: typeof code === "string" ? code : "unknown" } };
}

/** Line and column (1-based) of a character offset. */
function lineColumn(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lines = before.split("\n");
  return { line: lines.length, column: (lines[lines.length - 1]?.length ?? 0) + 1 };
}

/** Where a JSON document is broken, without the parser's English sentence. */
export function jsonReason(e: unknown, text: string): Msg {
  const message = (e as Error)?.message ?? "";
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { key: "reason.invalid_json", params: { line: Number(lc[1]), column: Number(lc[2]) } };
  const pos = /position (\d+)/.exec(message);
  // "Unexpected end of JSON input" has no position: the problem is at the end of the text.
  const at = lineColumn(text, pos ? Number(pos[1]) : text.length);
  return { key: "reason.invalid_json", params: at };
}

/** Where a TOML document is broken (smol-toml errors carry line and column). */
export function tomlReason(e: unknown): Msg {
  const err = e as { line?: unknown; column?: unknown };
  if (typeof err.line === "number" && typeof err.column === "number") {
    return { key: "reason.invalid_toml", params: { line: err.line, column: err.column } };
  }
  return { key: "reason.invalid_toml_plain" };
}
