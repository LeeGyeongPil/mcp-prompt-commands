import { join, resolve } from "node:path";
import { markerValues } from "../args.js";
import { ProtocolError, type PromptClient } from "../client.js";
import { EXIT_DRIFT, EXIT_OK, EXIT_SERVER, UsageError } from "../errors.js";
import { diffServer, isDrift, LOCK_NAME, readLock, sha256, type ServerDrift } from "../lock.js";
import { findByNameOrId } from "../names.js";
import { renderMessages } from "../render.js";
import type { PromptDef } from "../types.js";
import { loadDiscovery, runOnServers, say, selectServers, type Context } from "./common.js";

const FIELDS = ["title", "description", "arguments", "definition", "body"] as const;
function isField(f: string): f is (typeof FIELDS)[number] {
  return (FIELDS as readonly string[]).includes(f);
}

async function bodyHash(client: PromptClient, def: PromptDef): Promise<string | undefined> {
  try {
    const r = await client.getPrompt(def.name, markerValues(def.arguments));
    return sha256(renderMessages(r.messages).text);
  } catch (e) {
    if (e instanceof ProtocolError) return undefined;
    throw e;
  }
}

/** `check`: compare the lock file with what the servers offer now (exit 1 on drift). */
export async function checkCommand(ctx: Context): Promise<number> {
  const { opts, t } = ctx;
  const lockFile = join(resolve(ctx.cwd, opts.out), LOCK_NAME);
  const lock = readLock(lockFile);
  if (!lock) throw new UsageError({ key: "err.no_lock", params: { file: lockFile } });

  const discovery = loadDiscovery(ctx);
  const wanted = opts.servers.length > 0 ? selectServers(ctx, discovery) : undefined;
  const names = Object.keys(lock.servers).filter((n) => !wanted || wanted.some((s) => s.name === n));
  const specs = [];
  const missingServers: string[] = [];
  for (const n of names) {
    const spec = findByNameOrId(discovery.servers, n);
    if (spec) specs.push(spec);
    else missingServers.push(n);
  }

  const outcomes = await runOnServers(ctx, specs, async (client, spec) => {
    const current = await client.listPrompts();
    const locked = lock.servers[spec.name]?.prompts ?? {};
    const bodies: Record<string, string | undefined> = {};
    for (const def of current) {
      if (locked[def.name]?.bodyHash !== undefined) bodies[def.name] = await bodyHash(client, def);
    }
    return diffServer(locked, current, bodies);
  });

  const drifts: { server: string; drift: ServerDrift }[] = [];
  const problems: string[] = missingServers.map((n) => say(ctx, { key: "check.server_missing", params: { server: n } }));
  for (const o of outcomes) {
    if (o.status === "ok") drifts.push({ server: o.spec.name, drift: o.value });
    else problems.push(say(ctx, { key: "err.on_server", params: { server: o.spec.name, reason: o.reason } }));
  }
  const drifted = drifts.some((d) => isDrift(d.drift));
  const code = problems.length > 0 ? EXIT_SERVER : drifted ? EXIT_DRIFT : EXIT_OK;

  if (opts.json) {
    ctx.out(
      JSON.stringify(
        { drift: drifted, servers: drifts.map((d) => ({ name: d.server, ...d.drift })), errors: problems },
        null,
        2,
      ),
    );
    return code;
  }

  for (const { server, drift } of drifts) {
    if (!isDrift(drift)) continue;
    ctx.out(t("check.drift_in", { server }));
    for (const n of drift.added) ctx.out(`  + ${t("check.added")}: ${n}`);
    for (const n of drift.removed) ctx.out(`  - ${t("check.removed")}: ${n}`);
    for (const c of drift.changed) {
      // --json 은 필드 이름(title·description…)을 그대로 쓰고, 화면 출력만 번역한다.
      const fields = c.fields.map((f) => (isField(f) ? t(`check.field_${f}`) : f));
      ctx.out(`  ~ ${t("check.changed")}: ${c.name} (${fields.join(", ")})`);
    }
  }
  for (const p of problems) ctx.err(`${t("label.error")}: ${p}`);
  if (code === EXIT_OK) {
    const count = drifts.reduce((n, d) => n + (lock.servers[d.server] ? Object.keys(lock.servers[d.server]!.prompts).length : 0), 0);
    ctx.out(t("check.no_drift", { prompts: count, servers: drifts.length }));
  }
  return code;
}
