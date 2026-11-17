import { join, resolve } from "node:path";
import { buildArguments, markerValues, missingRequired, safeArgName } from "../args.js";
import { ProtocolError, withServer } from "../client.js";
import { EXIT_OK, ServerError, UsageError } from "../errors.js";
import { LOCK_NAME, readLock } from "../lock.js";
import { findByNameOrId } from "../names.js";
import { renderMessages, replaceMarkers } from "../render.js";
import type { PromptArgument } from "../types.js";
import { failureOf, loadDiscovery, say, type Context } from "./common.js";

function usageLine(server: string, prompt: string, defs: PromptArgument[]): string {
  const flags = defs.map((d) => (d.required ? `--arg ${d.name}=VALUE` : `[--arg ${d.name}=VALUE]`)).join(" ");
  return `mcp-prompt-commands get ${server} ${prompt}${flags ? ` ${flags}` : ""}`;
}

/** `get`: fetch one prompt from its server and print it as Markdown. */
export async function getCommand(ctx: Context): Promise<number> {
  const { opts, t } = ctx;
  const [serverQuery, promptQuery, ...values] = opts.positionals;
  if (serverQuery === undefined || promptQuery === undefined) throw new UsageError({ key: "err.get_usage" });

  const discovery = loadDiscovery(ctx);
  const spec = findByNameOrId(discovery.servers, serverQuery);
  if (!spec) {
    throw new UsageError({
      key: "err.no_such_server",
      params: { name: serverQuery, available: discovery.servers.map((s) => s.name).join(", ") || "-" },
    });
  }
  const input = { kv: opts.kv, json: opts.argsJson, line: opts.argsLine, positional: values };

  // Fast path: the lock written by `generate` already knows the required arguments, so a
  // missing value is reported before any server process is started.
  if (!opts.template) {
    const lock = readLock(join(resolve(ctx.cwd, opts.out), LOCK_NAME));
    const locked = lock?.servers[spec.name]?.prompts;
    const hit = locked ? findByNameOrId(Object.values(locked).map((p) => p.definition), promptQuery) : undefined;
    if (hit) {
      const missing = missingRequired(hit.arguments, buildArguments(hit.name, hit.arguments, input));
      if (missing.length > 0) {
        throw new UsageError({
          key: "err.missing_required",
          params: { names: missing.join(", "), usage: usageLine(spec.name, promptQuery, hit.arguments) },
        });
      }
    }
  }

  try {
    return await withServer(spec, { timeoutMs: opts.timeoutMs, verbose: opts.verbose, cwd: ctx.cwd }, async (client) => {
      const defs = await client.listPrompts();
      const def = findByNameOrId(defs, promptQuery);
      // Unknown prompt: let the server answer, it replies -32602 and we report it.
      const name = def?.name ?? promptQuery;
      const argDefs = def?.arguments ?? [];
      const given = def ? buildArguments(name, argDefs, input) : {};

      let send: Record<string, string>;
      if (opts.template) {
        send = markerValues(argDefs);
      } else {
        const missing = missingRequired(argDefs, given);
        if (missing.length > 0) {
          throw new UsageError({
            key: "err.missing_required",
            params: { names: missing.join(", "), usage: usageLine(spec.name, promptQuery, argDefs) },
          });
        }
        send = Object.fromEntries(Object.entries(given).filter(([, v]) => v !== ""));
      }

      const result = await client.getPrompt(name, send);
      const rendered = renderMessages(result.messages);
      let text = rendered.text;
      if (opts.template) {
        text = replaceMarkers(
          text,
          Object.fromEntries(argDefs.map((a) => [send[a.name] ?? "", `{{${safeArgName(a.name)}}}`])),
        );
      }
      for (const w of rendered.warnings) ctx.err(`${t("label.warning")}: ${say(ctx, w)}`);
      ctx.out(text);
      return EXIT_OK;
    });
  } catch (e) {
    if (e instanceof ProtocolError) {
      throw new ServerError(
        { key: opts.template ? "err.template_rejected" : "err.server_protocol", params: { code: e.code, detail: e.message } },
        e.code,
      );
    }
    if (e instanceof UsageError || e instanceof ServerError) throw e;
    // 연결 실패·타임아웃·프롬프트 미지원도 list·generate 와 같은 번역 문구로 exit 3 (내부 오류 스택이 아니라).
    const { reason } = failureOf(e, opts.timeoutMs);
    throw new ServerError({ key: "err.on_server", params: { server: spec.name, reason } });
  }
}
