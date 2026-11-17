import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileReason, jsonReason, UsageError } from "./errors.js";
import type { Format, Mode, PromptDef } from "./types.js";

export const LOCK_NAME = "mcp-prompt-commands.lock.json";

export interface LockPrompt {
  definition: PromptDef;
  /** sha256 of the canonical definition JSON. */
  hash: string;
  /** Generated file, relative to the output directory. */
  file: string;
  /** sha256 of the generated file as written (detects hand edits). */
  fileHash: string;
  format: Format;
  mode: Mode;
  /** Static mode only: sha256 of the captured template. */
  bodyHash?: string;
}

export interface Lock {
  version: 1;
  servers: Record<string, { prompts: Record<string, LockPrompt> }>;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Definition with a fixed key order, so the hash does not depend on the server's JSON order. */
export function canonicalDefinition(def: PromptDef): PromptDef {
  const out: PromptDef = { name: def.name, arguments: [] };
  if (def.title !== undefined) out.title = def.title;
  if (def.description !== undefined) out.description = def.description;
  out.arguments = def.arguments.map((a) => ({
    name: a.name,
    ...(a.description === undefined ? {} : { description: a.description }),
    required: a.required,
  }));
  return out;
}

export function definitionHash(def: PromptDef): string {
  return sha256(JSON.stringify(canonicalDefinition(def)));
}

export function emptyLock(): Lock {
  return { version: 1, servers: {} };
}

export function readLock(file: string): Lock | undefined {
  if (!existsSync(file)) return undefined;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    throw new UsageError({ key: "err.lock_invalid", params: { file, detail: fileReason(e) } });
  }
  let lock: Lock;
  try {
    lock = JSON.parse(text) as Lock;
  } catch (e) {
    throw new UsageError({ key: "err.lock_invalid", params: { file, detail: jsonReason(e, text) } });
  }
  if (typeof lock !== "object" || lock === null || lock.version !== 1 || typeof lock.servers !== "object" || lock.servers === null) {
    throw new UsageError({ key: "err.lock_invalid", params: { file, detail: { key: "reason.lock_unsupported" } } });
  }
  return lock;
}


export function serializeLock(lock: Lock): string {
  // Only the servers/prompts maps are sorted; definitions keep their canonical order.
  const servers: Lock["servers"] = {};
  for (const name of Object.keys(lock.servers).sort()) {
    const entry = lock.servers[name];
    if (!entry) continue;
    const prompts: Record<string, LockPrompt> = {};
    for (const p of Object.keys(entry.prompts).sort()) {
      const lp = entry.prompts[p];
      if (lp) prompts[p] = lp;
    }
    servers[name] = { prompts };
  }
  return `${JSON.stringify({ version: 1, servers }, null, 2)}\n`;
}

export function writeLock(file: string, lock: Lock): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serializeLock(lock));
}

export interface ServerDrift {
  added: string[];
  removed: string[];
  changed: { name: string; fields: string[] }[];
}

export function isDrift(d: ServerDrift): boolean {
  return d.added.length + d.removed.length + d.changed.length > 0;
}

function changedFields(a: PromptDef, b: PromptDef): string[] {
  const fields: string[] = [];
  if (a.title !== b.title) fields.push("title");
  if (a.description !== b.description) fields.push("description");
  if (JSON.stringify(canonicalDefinition(a).arguments) !== JSON.stringify(canonicalDefinition(b).arguments)) {
    fields.push("arguments");
  }
  return fields;
}

/**
 * Compares what the lock recorded with what the server offers now.
 * `currentBodyHashes` is only given for prompts whose lock entry is static.
 */
export function diffServer(
  locked: Record<string, LockPrompt>,
  current: PromptDef[],
  currentBodyHashes: Record<string, string | undefined>,
): ServerDrift {
  const drift: ServerDrift = { added: [], removed: [], changed: [] };
  const now = new Map(current.map((p) => [p.name, p]));
  for (const name of [...now.keys()].sort()) if (!(name in locked)) drift.added.push(name);
  for (const name of Object.keys(locked).sort()) {
    const lp = locked[name];
    const cur = now.get(name);
    if (!lp) continue;
    if (!cur) {
      drift.removed.push(name);
      continue;
    }
    const fields = definitionHash(cur) === lp.hash ? [] : changedFields(lp.definition, cur);
    if (fields.length === 0 && definitionHash(cur) !== lp.hash) fields.push("definition");
    if (lp.bodyHash !== undefined && currentBodyHashes[name] !== lp.bodyHash) fields.push("body");
    if (fields.length > 0) drift.changed.push({ name, fields });
  }
  return drift;
}
