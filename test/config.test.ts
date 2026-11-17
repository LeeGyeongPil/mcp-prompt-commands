import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { withServer } from "../src/client.js";
import { discover } from "../src/config/discover.js";
import { expandVars } from "../src/config/expand.js";
import { render } from "../src/i18n.js";
import { FIXTURES, STDIO_SERVER, baseEnv, startHttp, tmpDir } from "./helpers.js";

/** Lays the four fixture files out where each client keeps its config. */
function layout(dir: string): { cwd: string; home: string } {
  const cwd = join(dir, "project");
  const home = join(dir, "home");
  mkdirSync(join(cwd, ".vscode"), { recursive: true });
  mkdirSync(join(home, ".codex"), { recursive: true });
  copyFileSync(join(FIXTURES, "claude-project.json"), join(cwd, ".mcp.json"));
  copyFileSync(join(FIXTURES, "vscode.json"), join(cwd, ".vscode", "mcp.json"));
  copyFileSync(join(FIXTURES, "codex.toml"), join(home, ".codex", "config.toml"));
  const user = readFileSync(join(FIXTURES, "claude-user.json"), "utf8").replace("__CWD__", cwd);
  writeFileSync(join(home, ".claude.json"), user);
  return { cwd, home };
}

test("config: discovers four formats with precedence", (t) => {
  const { cwd, home } = layout(tmpDir(t));
  const d = discover({ cwd, home, env: baseEnv({ API_KEY: "k" }) });
  const bySource = Object.fromEntries(d.servers.map((s) => [s.name, s.source]));
  // local > project > vscode > user for the name "shared"
  assert.equal(bySource["shared"], "claude-local");
  assert.equal(bySource["local-only"], "claude-local");
  assert.equal(bySource["proj-only"], "claude-project");
  assert.equal(bySource["user-only"], "claude-user");
  assert.equal(bySource["vs-only"], "vscode");
  assert.equal(bySource["codex-only"], "codex");
  assert.equal(bySource["not-mine"], undefined, "other projects' local servers are ignored");
  assert.equal(d.files.length, 4);
  const shadowed = d.skipped.filter((s) => s.name === "shared").map((s) => s.source).sort();
  assert.deepEqual(shadowed, ["claude-project", "claude-user", "vscode"]);
  // --source limits the default files
  const onlyCodex = discover({ cwd, home, sources: ["codex"], env: baseEnv() });
  assert.ok(onlyCodex.servers.every((s) => s.source === "codex"));
});

test("config: expands variables and reports skipped servers", (t) => {
  const { cwd, home } = layout(tmpDir(t));
  const d = discover({ cwd, home, env: baseEnv() });
  const reason = (name: string): string => {
    const s = d.skipped.find((x) => x.name === name && x.reason.key !== "skip.shadowed");
    assert.ok(s, `expected ${name} to be skipped`);
    return render("en", s.reason);
  };
  assert.match(reason("remote"), /API_KEY/); // ${API_KEY} is unset and has no default
  assert.match(reason("needs-input"), /api-key.*interactive input/);
  assert.match(reason("legacy-sse"), /SSE/);
  assert.match(reason("no-type"), /no "type"/);
  assert.match(reason("oauth-server"), /OAuth/);
  assert.match(reason("codex-remote"), /CODEX_TOKEN/);
  assert.match(reason("codex-off"), /disabled/);

  // With the variables set, the remote servers resolve and ${VAR:-default} picks the default.
  const ok = discover({ cwd, home, env: baseEnv({ API_KEY: "secret", API_BASE: "http://localhost:9", CODEX_TOKEN: "tok" }) });
  const remote = ok.servers.find((s) => s.name === "remote");
  assert.deepEqual(remote?.transport, { kind: "http", url: "http://localhost:9/mcp", headers: { "x-api-key": "secret" } });
  const codexRemote = ok.servers.find((s) => s.name === "codex-remote");
  assert.deepEqual(codexRemote?.transport, {
    kind: "http",
    url: "http://127.0.0.1:1/mcp",
    headers: { Authorization: "Bearer tok" },
  });
  const vs = ok.servers.find((s) => s.name === "vs-only");
  assert.equal(vs?.transport.kind === "stdio" && vs.transport.args[0], `${cwd}/server.js`);
  const shared = ok.servers.find((s) => s.name === "shared");
  assert.equal(shared?.transport.kind === "stdio" && shared.transport.args[0], STDIO_SERVER);

  const x = expandVars("a-${X:-fallback}-${Y}-${Z:-}", { env: { Y: "why" }, cwd: "/c", vscode: false });
  assert.equal(x.value, "a-fallback-why-");
  assert.deepEqual(x.missing, []);
});

test("config: explicit --config files are detected by content and unreadable ones are reported", (t) => {
  const dir = tmpDir(t);
  const a = join(dir, "claude-project.json");
  copyFileSync(join(FIXTURES, "claude-project.json"), a);
  const v = join(dir, "vscode.json");
  copyFileSync(join(FIXTURES, "vscode.json"), v);
  const toml = join(dir, "codex.toml");
  copyFileSync(join(FIXTURES, "codex.toml"), toml);
  const d = discover({ cwd: dir, home: dir, configs: [a, v, toml], env: baseEnv() });
  assert.ok(d.servers.some((s) => s.source === "claude-project"));
  assert.ok(d.servers.some((s) => s.source === "vscode"));
  assert.ok(d.servers.some((s) => s.source === "codex"));
  assert.throws(() => discover({ cwd: dir, configs: [join(dir, "missing.json")], env: {} }), /not found/i);
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{ nope");
  assert.throws(() => discover({ cwd: dir, configs: [bad], env: {} }));
});

test("client: streamable http round trip with headers", async (t) => {
  const http = await startHttp(t, { HTTP_REQUIRE_KEY: "secret", MOCK_VARIANT: "paged" });
  const spec = (headers: Record<string, string>) => ({
    name: "remote",
    source: "claude-project" as const,
    file: "x",
    transport: { kind: "http" as const, url: http.url, headers },
  });
  const prompts = await withServer(spec({ "x-api-key": "secret" }), { timeoutMs: 15000 }, (c) => c.listPrompts());
  assert.equal(prompts.length, 25); // pages of 10 are followed through nextCursor
  const got = await withServer(spec({ "x-api-key": "secret" }), { timeoutMs: 15000 }, (c) => c.getPrompt("prompt_03", {}));
  assert.equal(got.messages.length, 1);
  await assert.rejects(withServer(spec({}), { timeoutMs: 15000 }, (c) => c.listPrompts()), /./);
});
