import type { Msg } from "../i18n.js";
import type { ServerSpec, Source, Transport } from "../types.js";
import { expandVars, type ExpandContext } from "./expand.js";

export type EntryResult = { spec: ServerSpec } | { skip: Msg };

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(v)) for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

/** Collects the unresolved-variable problems while expanding every string of one entry. */
export class Expander {
  readonly missing = new Set<string>();
  readonly inputs = new Set<string>();
  constructor(private readonly ctx: ExpandContext) {}
  str(text: string): string {
    const r = expandVars(text, this.ctx);
    r.missing.forEach((m) => this.missing.add(m));
    r.inputs.forEach((i) => this.inputs.add(i));
    return r.value;
  }
  map(m: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, this.str(v)]));
  }
  /** Returns the reason to skip when something could not be resolved. */
  problem(): Msg | undefined {
    if (this.inputs.size > 0) return { key: "skip.input_var", params: { ids: [...this.inputs].join(", ") } };
    if (this.missing.size > 0) return { key: "skip.unset_var", params: { vars: [...this.missing].join(", ") } };
    return undefined;
  }
}

/** Shared by the Claude Code and VS Code formats, which use the same entry fields. */
export function parseJsonEntry(
  name: string,
  entry: unknown,
  source: Source,
  file: string,
  ctx: ExpandContext,
): EntryResult {
  if (!isObject(entry)) return { skip: { key: "skip.invalid_entry" } };
  const type = typeof entry["type"] === "string" ? (entry["type"] as string) : undefined;
  const x = new Expander(ctx);
  let transport: Transport;

  if (typeof entry["command"] === "string" && (type === undefined || type === "stdio")) {
    transport = {
      kind: "stdio",
      command: x.str(entry["command"]),
      args: stringList(entry["args"]).map((a) => x.str(a)),
      env: x.map(stringMap(entry["env"])),
    };
    if (typeof entry["cwd"] === "string") transport.cwd = x.str(entry["cwd"]);
  } else if (typeof entry["url"] === "string") {
    if (type === undefined) return { skip: { key: "skip.url_without_type" } };
    if (type === "sse") return { skip: { key: "skip.sse" } };
    if (type !== "http" && type !== "streamable-http") return { skip: { key: "skip.unknown_type", params: { type } } };
    if (isObject(entry["oauth"])) return { skip: { key: "skip.oauth" } };
    transport = { kind: "http", url: x.str(entry["url"]), headers: x.map(stringMap(entry["headers"])) };
  } else {
    return { skip: { key: "skip.no_command_or_url" } };
  }

  const problem = x.problem();
  if (problem) return { skip: problem };
  return { spec: { name, source, file, transport } };
}
