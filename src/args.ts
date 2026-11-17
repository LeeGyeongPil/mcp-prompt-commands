import { createHash } from "node:crypto";
import { jsonReason, UsageError } from "./errors.js";
import type { PromptArgument } from "./types.js";

/**
 * Splits a string the way a POSIX shell would (single quotes, double quotes, backslash),
 * without ever starting a shell. Used for --args-line.
 */
export function shellSplit(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let active = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charAt(i);
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && i + 1 < input.length && '"\\$`'.includes(input.charAt(i + 1))) {
        i += 1;
        cur += input.charAt(i);
      } else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      active = true;
    } else if (c === "\\" && i + 1 < input.length) {
      i += 1;
      cur += input.charAt(i);
      active = true;
    } else if (/\s/.test(c)) {
      if (active || cur !== "") out.push(cur);
      cur = "";
      active = false;
    } else {
      cur += c;
      active = true;
    }
  }
  if (quote) throw new UsageError({ key: "err.unterminated_quote", params: { input } });
  if (active || cur !== "") out.push(cur);
  return out;
}

/** Name used in generated files: only letters, digits, "_", "." and "-". */
export function safeArgName(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_");
}

/** Identifier usable as a Claude Code named argument ($name). Unique within one prompt. */
export function argIdents(defs: PromptArgument[]): string[] {
  const used = new Set<string>();
  return defs.map((d) => {
    let base = d.name.replace(/[^A-Za-z0-9_]/g, "_");
    if (base === "" || /^\d/.test(base)) base = `_${base}`;
    let id = base;
    let n = 1;
    while (used.has(id)) {
      n += 1;
      id = `${base}_${n}`;
    }
    used.add(id);
    return id;
  });
}

/** Alphanumeric stand-in value sent to the server when fetching a template. */
export function markerFor(name: string): string {
  return `mpcarg${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
}

export function markerValues(defs: PromptArgument[]): Record<string, string> {
  return Object.fromEntries(defs.map((d) => [d.name, markerFor(d.name)]));
}

function matchName(defs: PromptArgument[], key: string): PromptArgument | undefined {
  return defs.find((d) => d.name === key) ?? defs.find((d) => safeArgName(d.name) === key);
}

export interface ArgInput {
  kv: string[];
  json?: string | undefined;
  line?: string | undefined;
  positional: string[];
}

/** Combines --args-json, --arg k=v, --args-line and positional values into a name -> value map. */
export function buildArguments(prompt: string, defs: PromptArgument[], input: ArgInput): Record<string, string> {
  const values: Record<string, string> = {};
  const valid = defs.map((d) => d.name).join(", ") || "-";
  const set = (key: string, value: string): void => {
    const def = matchName(defs, key);
    if (!def) throw new UsageError({ key: "err.unknown_argument", params: { name: key, prompt, valid } });
    values[def.name] = value;
  };

  if (input.json !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.json);
    } catch (e) {
      throw new UsageError({ key: "err.args_json", params: { detail: jsonReason(e, input.json) } });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new UsageError({ key: "err.args_json", params: { detail: { key: "reason.json_not_object" } } });
    }
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== "string") {
        throw new UsageError({ key: "err.args_json", params: { detail: { key: "reason.json_not_string", params: { name: k } } } });
      }
      set(k, v);
    }
  }
  for (const item of input.kv) {
    const eq = item.indexOf("=");
    if (eq <= 0) throw new UsageError({ key: "err.arg_format", params: { item } });
    set(item.slice(0, eq), item.slice(eq + 1));
  }
  const positional = [...(input.line === undefined ? [] : shellSplit(input.line)), ...input.positional];
  if (positional.length > defs.length) {
    throw new UsageError({ key: "err.too_many_values", params: { prompt, count: positional.length, max: defs.length } });
  }
  positional.forEach((value, i) => {
    const def = defs[i];
    if (def && values[def.name] === undefined) values[def.name] = value;
  });
  return values;
}

/** Required arguments that are missing or blank. */
export function missingRequired(defs: PromptArgument[], values: Record<string, string>): string[] {
  return defs.filter((d) => d.required && (values[d.name] ?? "").trim() === "").map((d) => d.name);
}
