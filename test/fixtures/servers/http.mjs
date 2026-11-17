// Streamable HTTP MCP server for tests (stateless). Prints "listening <port>" once ready.
//   HTTP_REQUIRE_KEY=secret   requires header x-api-key: secret, otherwise answers 401
//   HTTP_OAUTH=1              always answers 401 (as a server that needs OAuth sign-in)
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { GetPromptRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildPrompts, getResult, listResult } from "./prompts.mjs";

const prompts = buildPrompts(process.env.MOCK_VARIANT ?? "");
const requiredKey = process.env.HTTP_REQUIRE_KEY;

const http = createServer((req, res) => {
  if (process.env.HTTP_OAUTH === "1" || (requiredKey && req.headers["x-api-key"] !== requiredKey)) {
    res.writeHead(401, { "content-type": "application/json", "www-authenticate": 'Bearer realm="fixture"' });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const server = new Server({ name: "http-fixture", version: "0.0.1" }, { capabilities: { prompts: {} } });
    server.setRequestHandler(ListPromptsRequestSchema, async (r) => listResult(prompts, r.params?.cursor, 10));
    server.setRequestHandler(GetPromptRequestSchema, async (r) => getResult(prompts, r.params.name, r.params.arguments));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
});
http.listen(0, "127.0.0.1", () => console.log(`listening ${http.address().port}`));
process.on("SIGTERM", () => http.close(() => process.exit(0)));
