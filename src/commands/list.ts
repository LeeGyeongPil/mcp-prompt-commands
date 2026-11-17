import { EXIT_OK, EXIT_SERVER } from "../errors.js";
import { render as renderMsg } from "../i18n.js";
import { resolveNames } from "../names.js";
import {
  describeTransport,
  loadDiscovery,
  runOnServers,
  say,
  selectServers,
  serverIds,
  table,
  truncate,
  type Context,
} from "./common.js";

/** `list`: show the servers found in existing configs and the prompts each one offers. */
export async function listCommand(ctx: Context): Promise<number> {
  const discovery = loadDiscovery(ctx);
  const ids = serverIds(discovery);
  const selected = selectServers(ctx, discovery);
  const outcomes = await runOnServers(ctx, selected, (client) => client.listPrompts());
  const { t } = ctx;

  if (ctx.opts.json) {
    const json = {
      servers: outcomes.map((o) => ({
        name: o.spec.name,
        id: ids.get(o.spec.name),
        source: o.spec.source,
        transport: describeTransport(o.spec),
        status: o.status,
        ...(o.status === "ok" ? { prompts: o.value } : { reason: say(ctx, o.reason) }),
      })),
      skipped: discovery.skipped.map((s) => ({ name: s.name, source: s.source, reason: say(ctx, s.reason) })),
    };
    ctx.out(JSON.stringify(json, null, 2));
    return outcomes.some((o) => o.status === "error") ? EXIT_SERVER : EXIT_OK;
  }

  if (discovery.files.length === 0) ctx.out(t("list.no_config"));
  for (const o of outcomes) {
    const id = ids.get(o.spec.name) ?? o.spec.name;
    const head = `${o.spec.name} (${o.spec.source} · ${describeTransport(o.spec)})`;
    if (o.status !== "ok") {
      ctx.out(`${head}\n  ${t(o.status === "error" ? "list.error" : "list.skipped")}: ${say(ctx, o.reason)}`);
      continue;
    }
    ctx.out(`${head} — ${t("list.count", { n: o.value.length })}`);
    const ids2 = resolveNames(o.value.map((p) => p.name));
    const rows = [[t("list.col_prompt"), t("list.col_command"), t("list.col_arguments"), t("list.col_description")]];
    o.value.forEach((p, i) => {
      const args = p.arguments.map((a) => (a.required ? `${a.name} (${t("list.required")})` : a.name)).join(", ");
      rows.push([
        p.name,
        `/${id}:${ids2[i]?.id ?? p.name}`,
        args === "" ? "-" : args,
        truncate(p.description ?? p.title ?? "", 60),
      ]);
    });
    for (const line of table(rows)) ctx.out(`  ${line}`);
  }
  for (const s of discovery.skipped) {
    ctx.out(t("list.skipped_line", { name: s.name, source: s.source, reason: renderMsg(ctx.lang, s.reason) }));
  }
  return outcomes.some((o) => o.status === "error") ? EXIT_SERVER : EXIT_OK;
}
