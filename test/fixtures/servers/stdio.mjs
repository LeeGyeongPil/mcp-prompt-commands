// Stdio MCP server for tests. Variants come from MOCK_VARIANT, see prompts.mjs.
// MOCK_START_MARKER: a file that is created when the server starts (proves it was started).
import { writeFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GetPromptRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildPrompts, getResult, listResult } from "./prompts.mjs";

if (process.env.MOCK_START_MARKER) writeFileSync(process.env.MOCK_START_MARKER, "started\n");
const variant = process.env.MOCK_VARIANT ?? "";
const prompts = buildPrompts(variant);
const repeatCursor = variant.split(",").includes("repeat-cursor");
const noPrompts = variant.split(",").includes("noprompts");

const server = new Server({ name: "fixture", version: "0.0.1" }, { capabilities: noPrompts ? { tools: {} } : { prompts: {} } });
if (!noPrompts) {
  server.setRequestHandler(ListPromptsRequestSchema, async (req) => repeatCursor ? { prompts: [{ name: "p", arguments: [] }], nextCursor: "same" } : listResult(prompts, req.params?.cursor, 10));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => getResult(prompts, req.params.name, req.params.arguments));
}
await server.connect(new StdioServerTransport());
