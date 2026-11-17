import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { displayWidth, table } from "../src/commands/common.js";
import { catalogs, render, resolveLang } from "../src/i18n.js";
import { main } from "../src/main.js";
import { ROOT, baseEnv, listFiles, runCli, snapshotTree, tmpDir, write, writeStdioConfig } from "./helpers.js";

const gen = (dir: string, extra: string[] = []) =>
  runCli(["generate", "--config", "servers.json", "--out", "out", "--bin", "echo", ...extra], { cwd: dir });

test("list: collects all pages via nextCursor", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "paged");
  const r = runCli(["list", "--config", "servers.json", "--json"], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  assert.equal(json.servers[0].prompts.length, 25);
  assert.equal(json.servers[0].prompts[24].name, "prompt_25");
  const text = runCli(["list", "--config", "servers.json"], { cwd: dir });
  assert.match(text.stdout, /25 prompt\(s\)/);
});

test("list: shows arguments, commands and servers without prompts", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const r = runCli(["list", "--config", "servers.json"], { cwd: dir });
  assert.match(r.stdout, /code_review\s+\/mock:code_review\s+path \(required\), focus/);
  assert.match(r.stdout, /release notes\s+\/mock:release-notes/);
  writeStdioConfig(dir, "noprompts");
  const none = runCli(["list", "--config", "servers.json"], { cwd: dir });
  assert.equal(none.code, 0);
  assert.match(none.stdout, /skipped: the server does not offer prompts/);
});

test("get: renders roles and non-text placeholders", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const a = runCli(["get", "mock", "code_review", "--arg", "path=src/a.ts", "--arg", "focus=errors", "--config", "servers.json"], { cwd: dir });
  assert.equal(a.code, 0, a.stderr);
  assert.equal(
    a.stdout.trim(),
    [
      "### user",
      "Please review src/a.ts focusing on errors.",
      "",
      "### assistant",
      "Sure. Send me the file contents.",
      "",
      "### user",
      '<resource uri="mock://style-guide" mimeType="text/plain">',
      "Use 2-space indent.",
      "</resource>",
    ].join("\n"),
  );
  const tpl = runCli(["get", "mock", "code_review", "--template", "--config", "servers.json"], { cwd: dir });
  assert.match(tpl.stdout, /Please review \{\{path\}\} focusing on \{\{focus\}\}\./);

  writeStdioConfig(dir, "nontext");
  const n = runCli(["get", "mock", "media", "--config", "servers.json"], { cwd: dir });
  assert.equal(n.code, 0, n.stderr);
  for (const expected of [
    "[image omitted: image/png]",
    "[audio omitted: audio/wav]",
    "[binary resource omitted: mock://blob]",
    "[resource link not fetched: mock://linked]",
    "Embedded note.",
  ]) {
    assert.ok(n.stdout.includes(expected), expected);
  }
  assert.equal(n.stderr.split("\n").filter((l) => l.startsWith("warning:")).length, 4);
});

test("get: missing required argument exits 2 before connecting", (t) => {
  const dir = tmpDir(t);
  const marker = join(dir, "server-started");
  writeStdioConfig(dir, "", { MOCK_START_MARKER: marker });
  assert.equal(gen(dir).code, 0);
  assert.ok(existsSync(marker), "generate does start the server");
  rmSync(marker);
  for (const args of [[], ["--arg", "path="], ["--arg", "focus=errors"]]) {
    const r = runCli(["get", "mock", "code_review", ...args, "--config", "servers.json", "--out", "out"], { cwd: dir });
    assert.equal(r.code, 2, r.stderr);
    assert.match(r.stderr, /Missing required argument\(s\): path\. Usage: mcp-prompt-commands get mock code_review --arg path=VALUE/);
    assert.ok(!existsSync(marker), "the server must not have been started");
  }
  // Without a lock the check still happens, just after listing the prompts.
  const noLock = runCli(["get", "mock", "code_review", "--config", "servers.json", "--out", "nowhere"], { cwd: dir });
  assert.equal(noLock.code, 2);
  // Unknown argument names and too many values are usage errors as well.
  const bad = runCli(["get", "mock", "code_review", "--arg", "nope=1", "--config", "servers.json"], { cwd: dir });
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /no argument "nope"\. Valid arguments: path, focus/);
});

test("get: unknown prompt exits 3", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const r = runCli(["get", "mock", "nope", "--config", "servers.json"], { cwd: dir });
  assert.equal(r.code, 3);
  assert.match(r.stderr, /-32602/);
  assert.equal(r.stdout, "");
  const s = runCli(["get", "ghost", "x", "--config", "servers.json"], { cwd: dir });
  assert.equal(s.code, 2);
  assert.match(s.stderr, /No server named "ghost"/);
});

test("get: quoted multi-word positional value", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const first = runCli(["get", "mock", "code_review", "src/a b.ts", "errors", "--config", "servers.json"], { cwd: dir });
  assert.ok(first.stdout.startsWith("### user\nPlease review src/a b.ts focusing on errors."), first.stdout);
  // One string with shell-style quotes, split without starting a shell.
  const line = runCli(["get", "mock", "code_review", "--args-line", `"src/a b.ts" 'two words'`, "--config", "servers.json"], { cwd: dir });
  assert.ok(line.stdout.includes("Please review src/a b.ts focusing on two words."), line.stdout);
  const json = runCli(["get", "mock", "code_review", "--args-json", '{"path":"p q"}', "--config", "servers.json"], { cwd: dir });
  assert.ok(json.stdout.includes("Please review p q."), json.stdout);
  const many = runCli(["get", "mock", "code_review", "a", "b", "c", "--config", "servers.json"], { cwd: dir });
  assert.equal(many.code, 2);
});

test("check: no drift exits 0", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  assert.equal(gen(dir).code, 0);
  const c = runCli(["check", "--config", "servers.json", "--out", "out"], { cwd: dir });
  assert.equal(c.code, 0, c.stderr);
  assert.match(c.stdout, /Checked 2 prompt\(s\) on 1 server\(s\): no drift\./);
  const none = runCli(["check", "--config", "servers.json", "--out", "empty"], { cwd: dir });
  assert.equal(none.code, 2);
  assert.match(none.stderr, /Run `mcp-prompt-commands generate` first/);
});

test("check: reports added removed changed and exits 1", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  assert.equal(gen(dir).code, 0);
  const cases: [string, RegExp][] = [
    ["drift-desc", /~ changed: code_review \(description\)/],
    ["drift-add", /\+ added: summarize/],
    ["drift-remove", /- removed: release notes/],
    ["drift-required", /~ changed: code_review \(arguments\)/],
  ];
  for (const [variant, expected] of cases) {
    writeStdioConfig(dir, variant);
    const c = runCli(["check", "--config", "servers.json", "--out", "out"], { cwd: dir });
    assert.equal(c.code, 1, `${variant}: ${c.stderr}`);
    assert.match(c.stdout, /Drift in server "mock":/);
    assert.match(c.stdout, expected, variant);
  }
  writeStdioConfig(dir, "drift-add,drift-remove,drift-desc");
  const j = runCli(["check", "--config", "servers.json", "--out", "out", "--json"], { cwd: dir });
  assert.equal(j.code, 1);
  const json = JSON.parse(j.stdout);
  assert.equal(json.drift, true);
  assert.deepEqual(json.servers[0].added, ["summarize"]);
  assert.deepEqual(json.servers[0].removed, ["release notes"]);
  assert.deepEqual(json.servers[0].changed, [{ name: "code_review", fields: ["description"] }]);

  // A static file also notices when only the prompt text changed.
  const s = tmpDir(t);
  writeStdioConfig(s, "");
  assert.equal(runCli(["generate", "--config", "servers.json", "--out", "out", "--mode", "static"], { cwd: s }).code, 0);
  writeStdioConfig(s, "drift-body");
  const body = runCli(["check", "--config", "servers.json", "--out", "out"], { cwd: s });
  assert.equal(body.code, 1);
  assert.match(body.stdout, /~ changed: code_review \(body\)/);
  // Live files do not capture the body, so the same change is not drift there.
  writeStdioConfig(dir, "drift-body");
  assert.equal(runCli(["check", "--config", "servers.json", "--out", "out"], { cwd: dir }).code, 0);
});

test("safety: config files are never modified", (t) => {
  const dir = tmpDir(t);
  const home = join(dir, "home");
  write(join(home, ".claude.json"), JSON.stringify({ mcpServers: {} }));
  write(join(dir, ".vscode", "mcp.json"), JSON.stringify({ servers: {} }));
  writeStdioConfig(dir, "", {}, ".mcp.json");
  write(join(home, ".codex", "config.toml"), "# empty\n");
  const configFiles = [".mcp.json", ".vscode/mcp.json", "home/.claude.json", "home/.codex/config.toml"];
  const before = snapshotTree(dir);
  const run = (args: string[]) => runCli([...args, "--home", home], { cwd: dir });
  assert.equal(run(["list"]).code, 0);
  assert.equal(run(["generate", "--out", "out", "--bin", "echo"]).code, 0);
  assert.equal(run(["get", "mock", "code_review", "--arg", "path=x", "--out", "out"]).code, 0);
  assert.equal(run(["check", "--out", "out"]).code, 0);
  assert.equal(run(["generate", "--out", "out", "--dry-run"]).code, 0);
  const after = snapshotTree(dir);
  for (const f of configFiles) assert.equal(after[f], before[f], `${f} unchanged (bytes and mtime)`);
  const added = Object.keys(after).filter((f) => !(f in before));
  assert.ok(added.length > 0 && added.every((f) => f.startsWith("out/")), `new files only under out/: ${added.join(", ")}`);
});

test("safety: never overwrites user-authored files", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const mine = join(dir, "out", "commands", "mock", "code_review.md");
  write(mine, "my own command\n");
  for (const extra of [[], ["--force"]]) {
    const r = gen(dir, extra);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /was not generated by this tool; left untouched/);
    assert.equal(readFileSync(mine, "utf8"), "my own command\n");
  }
  assert.ok(existsSync(join(dir, "out", "commands", "mock", "release-notes.md")), "other prompts are still written");

  // A generated file that was edited by hand is kept unless --force is given.
  rmSync(mine);
  assert.equal(gen(dir).code, 0);
  writeFileSync(mine, `${readFileSync(mine, "utf8")}\nMy extra note.\n`);
  const kept = gen(dir);
  assert.match(kept.stderr, /was edited after generation/);
  assert.ok(readFileSync(mine, "utf8").includes("My extra note."));
  assert.equal(gen(dir, ["--force"]).code, 0);
  assert.ok(!readFileSync(mine, "utf8").includes("My extra note."));
});

test("safety: dry-run writes nothing", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const before = snapshotTree(dir);
  const r = gen(dir, ["--dry-run"]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Dry run: nothing is written\./);
  assert.match(r.stdout, /commands\/mock\/code_review\.md/);
  assert.deepEqual(snapshotTree(dir), before);
  assert.deepEqual(listFiles(dir), ["servers.json"]);
});

test("generate: removes files of prompts that disappeared, only if untouched", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  assert.equal(gen(dir).code, 0);
  const notes = join(dir, "out", "commands", "mock", "release-notes.md");
  assert.ok(existsSync(notes));
  writeStdioConfig(dir, "drift-remove");
  const r = gen(dir);
  assert.match(r.stdout, /removed\s+commands\/mock\/release-notes\.md/);
  assert.ok(!existsSync(notes));
  assert.equal(runCli(["check", "--config", "servers.json", "--out", "out"], { cwd: dir }).code, 0);
});

test("generate: unreachable servers are reported with exit 3", (t) => {
  const dir = tmpDir(t);
  write(join(dir, "servers.json"), JSON.stringify({ mcpServers: { broken: { command: "definitely-not-a-real-command-xyz" } } }));
  const r = runCli(["list", "--config", "servers.json", "--timeout", "5000"], { cwd: dir });
  assert.equal(r.code, 3);
  assert.match(r.stdout, /error: Could not talk to the server/);
});

test("generate: rejects unsafe --bin and --config values", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "", {}, "servers x.json");
  const bin = runCli(["generate", "--config", "servers x.json", "--bin", "x $(touch PWNED)"], { cwd: dir });
  assert.equal(bin.code, 2);
  assert.ok(!existsSync(join(dir, "PWNED")));
  const cfg = runCli(["generate", "--config", "servers x.json"], { cwd: dir });
  assert.equal(cfg.code, 2);
  assert.match(cfg.stderr, /cannot be written safely into a command file/);
});

test("list: a server that repeats its cursor stops with exit 3 and names the server", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "repeat-cursor");
  const r = runCli(["list", "--config", "servers.json", "--timeout", "5000"], { cwd: dir });
  assert.equal(r.code, 3);
  assert.match(r.stdout, /^mock \(/m);
  assert.match(r.stdout, /error: The server returned a repeating or endless prompts\/list cursor/);
  // QA r2 Q-6: generate's warning names the server exactly once (no "Server "mock": Server "mock" ...").
  for (const lang of ["en", "ko"]) {
    const g = runCli(["--lang", lang, "generate", "--config", "servers.json", "--out", "out", "--timeout", "5000"], { cwd: dir });
    assert.equal(g.code, 3, g.stderr);
    const line = g.stderr.split("\n").find((l) => l.includes("prompts/list")) ?? "";
    assert.equal(line.split('"mock"').length - 1, 1, line);
  }
  const g = runCli(["generate", "--config", "servers.json", "--out", "out", "--timeout", "5000"], { cwd: dir });
  assert.match(g.stderr, /warning: Server "mock": The server returned a repeating/);
});

test("table: pads by display width so Korean cells stay aligned", () => {
  assert.equal(displayWidth("abc"), 3);
  assert.equal(displayWidth("프롬프트"), 8);
  const rows = table([["프롬프트", "x"], ["abcdefgh", "y"]]);
  assert.equal(rows[0], "프롬프트  x");
  assert.equal(rows[1], "abcdefgh  y");
});

test("generate: --bin only accepts the safe character set", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir);
  for (const bin of ["node dist/cli.js; touch X", "a | b", "a && b", "a > b", "a (b)", "a 'b'", 'a "b"']) {
    const r = runCli(["generate", "--config", "servers.json", "--bin", bin], { cwd: dir });
    assert.equal(r.code, 2, bin);
    assert.match(r.stderr, /--bin .* is not allowed/);
  }
  assert.ok(!existsSync(join(dir, "X")));
  const ok = runCli(["generate", "--config", "servers.json", "--bin", "npx -y mcp-prompt-commands@0.1.0", "--dry-run"], { cwd: dir });
  assert.equal(ok.code, 0, ok.stderr);
});

test("package: prepack builds dist for both npm pack and npm publish", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    bin: Record<string, string>;
    files: string[];
  };
  // QA r2 Q-5: prepublishOnly runs only on `npm publish`; `npm pack` from a fresh clone shipped no dist/.
  assert.equal(pkg.scripts["prepack"], "npm run build");
  assert.equal(pkg.scripts["prepublishOnly"], undefined);
  assert.ok(pkg.files.includes("dist"));
  assert.equal(pkg.bin["mcp-prompt-commands"], "dist/cli.js");
});

// ---- QA r2 Q-2: stray positional arguments are an error, not silently dropped ----

test("args: list, generate and check reject extra positional arguments with exit 2", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir);
  // The demo line copied without quotes: `--bin node dist/cli.js` must not write a broken `!` line.
  const g = runCli(["generate", "--config", "servers.json", "--out", "out", "--bin", "node", "dist/cli.js"], { cwd: dir });
  assert.equal(g.code, 2, g.stdout);
  assert.match(g.stderr, /"generate" does not take extra arguments, got: dist\/cli\.js/);
  assert.match(g.stderr, /--bin "node dist\/cli\.js"/);
  assert.ok(!existsSync(join(dir, "out")), "nothing is written");
  const gko = runCli(["--lang", "ko", "generate", "--config", "servers.json", "--bin", "node", "dist/cli.js"], { cwd: dir });
  assert.equal(gko.code, 2);
  assert.match(gko.stderr, /추가 인자를 받지 않습니다.*--bin "node dist\/cli\.js"/);

  const l = runCli(["list", "extra", "junk", "--config", "servers.json"], { cwd: dir });
  assert.equal(l.code, 2);
  assert.match(l.stderr, /"list" does not take extra arguments, got: extra junk\. Quote option values/);
  const c = runCli(["check", "foo", "--config", "servers.json", "--out", "out"], { cwd: dir });
  assert.equal(c.code, 2);
  assert.match(c.stderr, /"check" does not take extra arguments, got: foo/);
  // An inline value (--out=x y) is not a split value: the plain message is used.
  const inline = runCli(["list", "--config=servers.json", "y"], { cwd: dir });
  assert.equal(inline.code, 2);
  assert.doesNotMatch(inline.stderr, /quote the whole value/);
  // The quoted form still works, and `get` keeps taking prompt values positionally.
  const ok = runCli(["generate", "--config", "servers.json", "--out", "out", "--bin", "node dist/cli.js", "--dry-run"], { cwd: dir });
  assert.equal(ok.code, 0, ok.stderr);
  const get = runCli(["get", "mock", "code_review", "src/a.ts", "errors", "--config", "servers.json"], { cwd: dir });
  assert.equal(get.code, 0, get.stderr);
});

// ---- QA r2 Q-1: every user-facing message follows --lang, including nested reasons ----

/** A run of four or more English words: an untranslated sentence inside Korean output. */
const ENGLISH_SENTENCE = /[A-Za-z]{2,}(?: [a-z]{2,}){3,}/;

test("i18n: a broken or unreadable default config warns in Korean without English text", (t) => {
  const dir = tmpDir(t);
  const home = tmpDir(t, "home");
  writeStdioConfig(dir, "", {}, ".mcp.json");
  write(join(home, ".claude.json"), "{ not json");
  const r = runCli(["--lang", "ko", "get", "mock", "code_review", "--template"], { cwd: dir, env: { HOME: home } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /경고: 설정 파일 .*\.claude\.json 을\(를\) 무시했습니다: JSON 형식이 올바르지 않습니다 \(1행 3열\)/);
  assert.doesNotMatch(r.stderr, /Cannot read|Fix the file|--config|Expected|position/);
  assert.doesNotMatch(r.stderr, ENGLISH_SENTENCE);
  const en = runCli(["list"], { cwd: dir, env: { HOME: home } });
  assert.match(en.stderr, /warning: Ignored config file .*\.claude\.json: not valid JSON \(line 1, column 3\)$/m);
  assert.doesNotMatch(en.stderr, /pass a different --config/);

  // Unreadable (permission) file: the OS reason is translated too. Root can read anything, so
  // this part only runs when chmod really takes the read permission away.
  write(join(home, ".claude.json"), "{}");
  // (No need to restore the mode: removing the temp folder only needs write access to the folder.)
  chmodSync(join(home, ".claude.json"), 0o000);
  let readable = true;
  try {
    readFileSync(join(home, ".claude.json"));
  } catch {
    readable = false;
  }
  if (!readable) {
    const p = runCli(["--lang", "ko", "list"], { cwd: dir, env: { HOME: home } });
    assert.equal(p.code, 0, p.stderr);
    assert.match(p.stderr, /무시했습니다: 접근 권한이 없습니다/);
    assert.doesNotMatch(p.stderr, /EACCES|EPERM|permission denied|operation not permitted/);
  }
});

test("i18n: Korean errors for options, configs, locks and servers contain no English sentence", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir);
  write(join(dir, "bad.json"), "{\n  \"mcpServers\": {,\n}");
  write(join(dir, "bad.toml"), "a = = 1\n");
  write(join(dir, "broken.json"), JSON.stringify({ mcpServers: { broken: { command: "definitely-not-a-real-command-xyz" } } }));
  write(join(dir, "lockbad", "mcp-prompt-commands.lock.json"), "[]");
  const ko = (args: string[]) => runCli(["--lang", "ko", ...args], { cwd: dir });
  const cases: [string[], number, RegExp][] = [
    [["list", "--config", "bad.json"], 2, /JSON 형식이 올바르지 않습니다 \(2행 18열\)/],
    [["list", "--config", "bad.toml"], 2, /TOML 형식이 올바르지 않습니다 \(1행 5열\)/],
    [["list", "--nope"], 2, /알 수 없는 옵션 "--nope"/],
    [["list", "--timeout"], 2, /옵션 "--timeout" 에는 값이 필요합니다/],
    [["list", "--json=yes"], 2, /옵션 "--json" 은\(는\) 값을 받지 않습니다/],
    [["get", "mock", "code_review", "--args-json", "{bad", "--config", "servers.json"], 2, /JSON 형식이 올바르지 않습니다/],
    [["get", "mock", "code_review", "--args-json", "[1]", "--config", "servers.json"], 2, /객체가 필요합니다/],
    [["get", "mock", "code_review", "--args-json", '{"path":1}', "--config", "servers.json"], 2, /"path" 값이 문자열이 아닙니다/],
    [["check", "--config", "servers.json", "--out", "lockbad"], 2, /지원하지 않는 lock 형식입니다/],
    [["list", "--config", "broken.json", "--timeout", "5000"], 3, /명령 "definitely-not-a-real-command-xyz" 을\(를\) 찾을 수 없습니다/],
    // get used to end with an internal error (exit 4 and a stack trace) when the server could not start.
    [["get", "broken", "x", "--config", "broken.json", "--timeout", "5000"], 3, /서버 "broken": 서버와 통신하지 못했습니다: 명령 "definitely/],
  ];
  for (const [args, code, expected] of cases) {
    const r = ko(args);
    const all = `${r.stdout}\n${r.stderr}`;
    assert.equal(r.code, code, `${args.join(" ")}: ${all}`);
    assert.match(all, expected, args.join(" "));
    assert.doesNotMatch(all, ENGLISH_SENTENCE, args.join(" "));
    assert.doesNotMatch(all, /\n\s+at /, "no stack trace");
  }
  // English is still English (and the reason is the same fact).
  const en = runCli(["list", "--config", "bad.json"], { cwd: dir });
  assert.match(en.stderr, /Cannot read .*bad\.json: not valid JSON \(line 2, column 18\)\. Fix the file/);
  const gnone = runCli(["get", "broken", "x", "--config", "broken.json", "--timeout", "5000"], { cwd: dir });
  assert.equal(gnone.code, 3);
  assert.match(gnone.stderr, /Server "broken": Could not talk to the server: command "definitely-not-a-real-command-xyz" was not found/);
});

test("i18n: nested messages render in the outer language", () => {
  const msg = { key: "warn.config_unreadable", params: { file: "x", detail: { key: "reason.permission_denied" } } } as const;
  assert.equal(render("ko", msg), "설정 파일 x 을(를) 무시했습니다: 접근 권한이 없습니다");
  assert.equal(render("en", msg), "Ignored config file x: permission denied");
  // Values are inserted once and never scanned again.
  assert.equal(render("en", { key: "err.on_server", params: { server: "{reason}", reason: "r" } }), 'Server "{reason}": r');
});

test("i18n: check lists changed fields in the chosen language", (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  assert.equal(gen(dir).code, 0);
  writeStdioConfig(dir, "drift-desc");
  const c = runCli(["--lang", "ko", "check", "--config", "servers.json", "--out", "out"], { cwd: dir });
  assert.equal(c.code, 1);
  assert.match(c.stdout, /~ 변경됨: code_review \(설명\)/);
  const j = runCli(["--lang", "ko", "check", "--config", "servers.json", "--out", "out", "--json"], { cwd: dir });
  assert.deepEqual(JSON.parse(j.stdout).servers[0].changed, [{ name: "code_review", fields: ["description"] }]);
});

test("config: a broken default user config warns and other sources still work", (t) => {
  const dir = tmpDir(t);
  const home = tmpDir(t, "home");
  write(join(home, ".claude.json"), "{ not json");
  writeStdioConfig(dir, "", {}, ".mcp.json");
  const r = runCli(["list", "--timeout", "5000"], { cwd: dir, env: { HOME: home } });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /code_review/);
  assert.match(r.stderr, /Ignored config file .*\.claude\.json/);
  // A file named with --config stays fatal.
  write(join(dir, "bad.json"), "{ not json");
  assert.equal(runCli(["list", "--config", "bad.json"], { cwd: dir, env: { HOME: home } }).code, 2);
});

// ---- i18n ----

test("i18n: en and ko catalogs have identical keys", () => {
  const en = Object.keys(catalogs.en).sort();
  const ko = Object.keys(catalogs.ko).sort();
  assert.deepEqual(ko, en);
  const slots = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
  for (const key of en) {
    if (key === "help.text") continue; // the help text mentions {{name}} placeholders literally
    const k = key as keyof typeof catalogs.en;
    assert.deepEqual(slots(catalogs.ko[k]), slots(catalogs.en[k]), `placeholders of ${key}`);
    assert.ok(catalogs.ko[k].trim() !== "", key);
  }
});

test("i18n: language resolution order", () => {
  const env = { MCP_PROMPT_COMMANDS_LANG: "ko", LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };
  assert.equal(resolveLang("en", env), "en", "--lang beats everything");
  assert.equal(resolveLang(undefined, env), "ko", "tool variable beats locale");
  assert.equal(resolveLang(undefined, { LC_ALL: "ko_KR.UTF-8", LC_MESSAGES: "en_US", LANG: "en_US" }), "ko", "LC_ALL first");
  assert.equal(resolveLang(undefined, { LC_MESSAGES: "ko_KR.UTF-8", LANG: "en_US" }), "ko", "then LC_MESSAGES");
  assert.equal(resolveLang(undefined, { LANG: "ko_KR.UTF-8" }), "ko", "then LANG");
  assert.equal(resolveLang(undefined, { LANG: "fr_FR.UTF-8" }), "en", "not Korean means English");
  assert.equal(resolveLang(undefined, {}), "en");
  assert.equal(resolveLang(undefined, { MCP_PROMPT_COMMANDS_LANG: "", LANG: "ko_KR" }), "ko", "empty variables are ignored");
});

test("i18n: --lang switches help and list output", async (t) => {
  const dir = tmpDir(t);
  writeStdioConfig(dir, "");
  const ko = runCli(["--lang", "ko", "--help"], { cwd: dir });
  assert.equal(ko.code, 0);
  assert.match(ko.stdout, /사용법/);
  const en = runCli(["--lang", "en", "--help"], { cwd: dir });
  assert.match(en.stdout, /Usage/);
  assert.doesNotMatch(en.stdout, /사용법/);
  const lko = runCli(["--lang", "ko", "list", "--config", "servers.json"], { cwd: dir });
  assert.match(lko.stdout, /프롬프트 2개/);
  assert.match(lko.stdout, /path \(필수\)/);
  const len = runCli(["--lang", "en", "list", "--config", "servers.json"], { cwd: dir, env: { MCP_PROMPT_COMMANDS_LANG: "ko" } });
  assert.match(len.stdout, /2 prompt\(s\)/);
  // The environment variable alone also works, and errors follow the language too.
  const envKo = runCli(["get", "mock"], { cwd: dir, env: { MCP_PROMPT_COMMANDS_LANG: "ko" } });
  assert.equal(envKo.code, 2);
  assert.match(envKo.stderr, /사용법/);
  const bad = runCli(["--lang", "fr", "list"], { cwd: dir });
  assert.equal(bad.code, 2);
  // In-process entry point: no output goes anywhere except the given io.
  const out: string[] = [];
  const code = await main(["--version"], baseEnv(), { out: (s) => out.push(s), err: (s) => out.push(s) });
  assert.equal(code, 0);
  assert.match(out.join(""), /^\d+\.\d+\.\d+/);
});
