import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { markerValues } from "../args.js";
import { ProtocolError, type PromptClient } from "../client.js";
import { EXIT_OK, EXIT_SERVER, UsageError } from "../errors.js";
import { buildFile, GENERATED_MARKER, toStaticTemplate, type BuiltFile } from "../generate.js";
import type { Msg } from "../i18n.js";
import {
  definitionHash,
  emptyLock,
  LOCK_NAME,
  readLock,
  sha256,
  writeLock,
  type Lock,
  type LockPrompt,
} from "../lock.js";
import { resolveNames, skillDirName } from "../names.js";
import { renderMessages } from "../render.js";
import type { PromptDef } from "../types.js";
import { loadDiscovery, runOnServers, say, selectServers, serverIds, type Context } from "./common.js";

type FileStatus = "created" | "updated" | "unchanged" | "skipped_user" | "skipped_edited" | "removed";

interface Probe {
  template: string | undefined;
  bodyHash: string | undefined;
  rejected: boolean;
  warnings: Msg[];
}

const SAFE_BIN = /^[A-Za-z0-9_./:@+=, -]+$/;
const SAFE_PATH = /^[A-Za-z0-9_./:@+=,-]+$/;

/** True when `bin` (first word) can be found on PATH or is a path to an executable file. */
function binExists(bin: string, env: Record<string, string | undefined>, cwd: string): boolean {
  const first = bin.split(/\s+/)[0] ?? "";
  if (first === "") return false;
  const dirs = first.includes("/") ? [""] : (env["PATH"] ?? "").split(delimiter);
  return dirs.some((d) => {
    try {
      accessSync(first.includes("/") ? resolve(cwd, first) : join(d, first), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function validateBin(bin: string): void {
  if (!SAFE_BIN.test(bin) || bin.trim() === "") throw new UsageError({ key: "err.bad_bin", params: { bin } });
}

/** Fetches the template with marker values; a server error means the template cannot be captured. */
async function probe(client: PromptClient, def: PromptDef): Promise<Probe> {
  const markers = markerValues(def.arguments);
  try {
    const r = await client.getPrompt(def.name, markers);
    const rendered = renderMessages(r.messages);
    return {
      template: toStaticTemplate(rendered.text, def, markers),
      bodyHash: sha256(rendered.text),
      rejected: false,
      warnings: rendered.warnings,
    };
  } catch (e) {
    if (e instanceof ProtocolError) {
      return {
        template: undefined,
        bodyHash: undefined,
        rejected: true,
        warnings: [{ key: "warn.template_rejected", params: { prompt: def.name, code: e.code } }],
      };
    }
    throw e;
  }
}

/** `generate`: write one command (or skill) file per prompt, plus the lock file. */
export async function generateCommand(ctx: Context): Promise<number> {
  const { opts, t } = ctx;
  validateBin(opts.bin);
  const extraArgs: string[] = [];
  for (const c of opts.configs) {
    if (!SAFE_PATH.test(c)) throw new UsageError({ key: "err.unsafe_path", params: { path: c } });
    extraArgs.push("--config", c);
  }
  const discovery = loadDiscovery(ctx);
  const ids = serverIds(discovery);
  const selected = selectServers(ctx, discovery);
  const outDir = resolve(ctx.cwd, opts.out);
  const lockFile = join(outDir, LOCK_NAME);
  const lock: Lock = readLock(lockFile) ?? emptyLock();
  const warnings: Msg[] = [];

  const outcomes = await runOnServers(ctx, selected, async (client) => {
    const defs = await client.listPrompts();
    const probes = new Map<string, Probe>();
    if (opts.mode !== "agent") {
      for (const def of defs) probes.set(def.name, await probe(client, def));
    }
    return { defs, probes };
  });

  const files: { path: string; status: FileStatus }[] = [];
  const usedSkillDirs = new Set<string>();
  let failed = false;

  for (const o of outcomes) {
    if (o.status !== "ok") {
      if (o.status === "error") failed = true;
      warnings.push({
        key: o.status === "error" ? "warn.server_failed" : "warn.server_skipped",
        params: { server: o.spec.name, reason: o.reason },
      });
      continue;
    }
    const serverId = ids.get(o.spec.name) ?? o.spec.name;
    const { defs, probes } = o.value;
    const promptIds = resolveNames(defs.map((d) => d.name));
    const previous = lock.servers[o.spec.name]?.prompts ?? {};
    const entry: Record<string, LockPrompt> = {};

    const order = defs.map((d, i) => ({ def: d, id: promptIds[i] })).sort((a, b) => (a.def.name < b.def.name ? -1 : 1));
    for (const { def, id } of order) {
      if (!id) continue;
      if (id.collided) {
        warnings.push({ key: "warn.name_collision", params: { server: o.spec.name, prompt: def.name, id: id.id } });
      }
      const skillDir = skillDirName(serverId, id.id, usedSkillDirs);
      if (opts.format === "skills") usedSkillDirs.add(skillDir);

      const pr = probes.get(def.name);
      pr?.warnings.forEach((w) => warnings.push(w));
      const built: BuiltFile = buildFile({
        serverId,
        promptId: id.id,
        skillDir,
        def,
        format: opts.format,
        mode: opts.mode,
        bin: opts.bin,
        allowedTools: opts.allowedTools,
        extraArgs,
        template: pr?.template,
        rejected: pr?.rejected ?? false,
      });

      const abs = join(outDir, built.path);
      const existing = existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
      let status: FileStatus;
      if (existing === undefined) status = "created";
      else if (!existing.includes(GENERATED_MARKER)) status = "skipped_user";
      else if (existing === built.content) status = "unchanged";
      else {
        const recorded = previous[def.name]?.fileHash;
        const edited = recorded !== undefined && recorded !== sha256(existing);
        status = edited && !opts.force ? "skipped_edited" : "updated";
      }
      if (status === "skipped_user") warnings.push({ key: "warn.skipped_user_file", params: { path: built.path } });
      if (status === "skipped_edited") warnings.push({ key: "warn.skipped_edited_file", params: { path: built.path } });
      if (status === "created" || status === "updated") {
        if (!opts.dryRun) {
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, built.content);
        }
      }
      files.push({ path: built.path, status });

      const bodyHash = built.mode === "static" ? pr?.bodyHash : undefined;
      const lp: LockPrompt = {
        definition: def,
        hash: definitionHash(def),
        file: built.path,
        fileHash: sha256(built.content),
        format: opts.format,
        mode: built.mode,
      };
      if (bodyHash !== undefined) lp.bodyHash = bodyHash;
      entry[def.name] = lp;
    }

    // Files from an earlier run whose prompt is gone: remove only ones we generated and nobody edited.
    for (const [name, old] of Object.entries(previous)) {
      // Keep it only when the prompt still exists and still maps to the same file.
      if (Object.values(entry).some((e) => e.file === old.file)) continue;
      const abs = join(outDir, old.file);
      if (!existsSync(abs)) continue;
      const text = readFileSync(abs, "utf8");
      if (!text.includes(GENERATED_MARKER) || (sha256(text) !== old.fileHash && !opts.force)) continue;
      if (!opts.dryRun) rmSync(abs);
      files.push({ path: old.file, status: "removed" });
    }
    lock.servers[o.spec.name] = { prompts: entry };
  }

  if (!opts.dryRun && outcomes.some((o) => o.status === "ok")) {
    writeLock(lockFile, lock);
  }

  if (opts.format === "commands" || opts.format === "skills") {
    if (opts.mode !== "static" && !binExists(opts.bin, ctx.env, ctx.cwd)) {
      warnings.push({ key: "warn.bin_missing", params: { bin: opts.bin } });
    }
  }

  if (opts.json) {
    ctx.out(
      JSON.stringify(
        {
          dryRun: opts.dryRun,
          out: outDir,
          files,
          warnings: warnings.map((w) => say(ctx, w)),
          lock: opts.dryRun ? null : lockFile,
        },
        null,
        2,
      ),
    );
  } else {
    if (opts.dryRun) ctx.out(t("gen.dry_run"));
    for (const f of files) ctx.out(`  ${t(`file.${f.status}`)}  ${f.path}`);
    if (files.length === 0) ctx.out(t("gen.nothing"));
    else if (!opts.dryRun) ctx.out(t("gen.lock_written", { path: lockFile }));
    for (const w of warnings) ctx.err(`${t("label.warning")}: ${say(ctx, w)}`);
  }
  return failed ? EXIT_SERVER : EXIT_OK;
}
