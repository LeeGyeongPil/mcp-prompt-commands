// Practice (mock) MCP server: speaks the real MCP protocol over stdio and offers two prompts.
// It exists so every feature of mcp-prompt-commands can be tried without any account or key.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "mock-prompts", version: "0.0.1" });

server.registerPrompt(
  "code_review",
  {
    title: "Request Code Review",
    description: "Review a file for bugs and style",
    argsSchema: {
      path: z.string().describe("File path to review"),
      focus: z.string().optional().describe("What to focus on"),
    },
  },
  ({ path, focus }) => ({
    description: "Code review prompt",
    messages: [
      { role: "user", content: { type: "text", text: `Please review ${path}${focus ? ` focusing on ${focus}` : ""}.` } },
      { role: "assistant", content: { type: "text", text: "Sure. Send me the file contents." } },
      {
        role: "user",
        content: {
          type: "resource",
          resource: { uri: "mock://style-guide", mimeType: "text/plain", text: "Use 2-space indent." },
        },
      },
    ],
  })
);

server.registerPrompt(
  "release notes",
  { description: "Prompt name with a space (name normalization test)" },
  () => ({ messages: [{ role: "user", content: { type: "text", text: "Write release notes." } }] })
);

await server.connect(new StdioServerTransport());
