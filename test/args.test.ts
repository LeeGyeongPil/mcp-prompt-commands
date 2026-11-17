import assert from "node:assert/strict";
import { test } from "node:test";
import { argIdents, buildArguments, markerFor, missingRequired, shellSplit } from "../src/args.js";
import { UsageError } from "../src/errors.js";
import { neutralizeHostSyntax } from "../src/generate.js";

test("args: shell-style splitting without a shell", () => {
  assert.deepEqual(shellSplit(`a "b c" 'd e' f\\ g ""`), ["a", "b c", "d e", "f g", ""]);
  assert.deepEqual(shellSplit(`"a \\"q\\" $HOME"`), ['a "q" $HOME']);
  assert.throws(() => shellSplit(`"open`), UsageError);
});

test("args: positional values follow definition order and validation messages are actionable", () => {
  const defs = [
    { name: "path", required: true },
    { name: "focus", required: false },
  ];
  assert.deepEqual(buildArguments("p", defs, { kv: ["focus=x"], positional: ["a.ts"] }), { focus: "x", path: "a.ts" });
  assert.deepEqual(missingRequired(defs, { path: "  " }), ["path"]);
  assert.throws(() => buildArguments("p", defs, { kv: ["oops"], positional: [] }), /name=value/);
  assert.throws(() => buildArguments("p", defs, { kv: [], json: "[1]", positional: [] }), /JSON object/);
  assert.throws(() => buildArguments("p", defs, { kv: [], json: '{"path":1}', positional: [] }), /not a string/);
  assert.deepEqual(argIdents([{ name: "a-b", required: false }, { name: "a_b", required: false }, { name: "1x", required: false }]), ["a_b", "a_b_2", "_1x"]);
  assert.match(markerFor("path"), /^mpcarg[0-9a-f]{10}$/);
});

test("generate: host syntax in server text is neutralized", () => {
  const out = neutralizeHostSyntax("a !`x` b\n!`y`\n```!\nz\n```\n$1 $ARGUMENTS $name $namex $other", ["name"]);
  assert.ok(!/(^|\s)!`/.test(out));
  assert.ok(!/`{3,}!/.test(out));
  assert.ok(out.includes("\\$1 \\$ARGUMENTS \\$name"));
  assert.ok(out.endsWith("$other"));
});
