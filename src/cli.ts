#!/usr/bin/env node
import { main } from "./main.js";

const code = await main(process.argv.slice(2), process.env, {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
});
process.exitCode = code;
// A misbehaving server process must never keep the CLI alive.
setTimeout(() => process.exit(code), 3000).unref();
