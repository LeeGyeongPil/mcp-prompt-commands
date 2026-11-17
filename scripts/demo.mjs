// `npm run demo`: runs the whole flow against the bundled practice (mock) MCP server.
// The server in examples/mock-server.mjs is a real MCP server (stdio), but it only serves
// two made-up prompts, so no account, key or network is needed.
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "dist", "cli.js");
// English unless the caller picked a language (MCP_PROMPT_COMMANDS_LANG=ko for Korean).
const lang = process.env.MCP_PROMPT_COMMANDS_LANG ?? "en";
const env = { ...process.env, MCP_PROMPT_COMMANDS_LANG: lang };
// --bin makes the generated files call this checkout instead of a globally installed copy.
const common = ["--config", "examples/mcp.json", "--out", "demo-out", "--bin", "node dist/cli.js"];

// Prints an argument so the shown command line can be copied as-is: a value with a space
// (like --bin "node dist/cli.js") must stay one argument in the reader's shell too.
function shellQuote(arg) {
  return /^[A-Za-z0-9_./:@+=,-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
}

function run(title, args, { show = true } = {}) {
  console.log(`\n$ mcp-prompt-commands ${args.map(shellQuote).join(" ")}   # ${title}`);
  const r = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: "utf8" });
  if (show) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`demo step failed with exit code ${r.status}`);
    process.exit(1);
  }
}

console.log("Practice (mock) mode: using the bundled mock MCP server, not a real one.");
rmSync(join(root, "demo-out"), { recursive: true, force: true });

run("1. which prompts does the server offer?", ["list", "--config", "examples/mcp.json"]);
run("2. write one command file per prompt (live mode)", ["generate", ...common]);
console.log("\n--- demo-out/commands/mock/code_review.md ---");
console.log(readFileSync(join(root, "demo-out", "commands", "mock", "code_review.md"), "utf8"));
run("3. what the command fetches when it runs", ["get", "mock", "code_review", "--arg", "path=src/a.ts", "--config", "examples/mcp.json"]);
run("4. does the lock file still match the server?", ["check", "--config", "examples/mcp.json", "--out", "demo-out"]);
