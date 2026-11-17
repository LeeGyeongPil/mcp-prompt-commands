import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { PromptMessage } from "./render.js";
import type { PromptArgument, PromptDef, ServerSpec } from "./types.js";
import { VERSION } from "./version.js";

export interface ConnectOptions {
  timeoutMs: number;
  /** Forward the server's stderr to ours (for debugging a server that fails to start). */
  verbose?: boolean;
  cwd?: string;
}

/** The server does not declare the prompts capability. */
export class NoPromptsError extends Error {}
/** The server keeps returning a pagination cursor it already returned, or never stops paging. */
export class PaginationError extends Error {}
/** The remote server answered 401/403: it needs OAuth or a token we do not have. */
export class AuthRequiredError extends Error {}
/** The server answered with a JSON-RPC error (for example -32602 for bad arguments). */
export class ProtocolError extends Error {
  readonly code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export interface GetResult {
  description?: string | undefined;
  messages: PromptMessage[];
}

export interface PromptClient {
  listPrompts(): Promise<PromptDef[]>;
  getPrompt(name: string, args: Record<string, string>): Promise<GetResult>;
}

/** Upper bound on listPrompts pages per server. */
export const MAX_PAGES = 1000;

/** SDK-side codes that mean "no answer" rather than "the server answered with an error". */
export const CODE_CONNECTION_CLOSED = -32000;
export const CODE_REQUEST_TIMEOUT = -32001;

export function isLocalTransportError(e: unknown): boolean {
  const code = (e as { code?: unknown }).code;
  const message = (e as { message?: unknown }).message;
  return (
    code === CODE_REQUEST_TIMEOUT ||
    (code === CODE_CONNECTION_CLOSED && typeof message === "string" && /connection closed/i.test(message))
  );
}

function toProtocolError(e: unknown): unknown {
  const code = (e as { code?: unknown }).code;
  // 타임아웃·연결 끊김은 SDK 가 스스로 만든 오류라 서버 응답 오류로 보고하지 않는다.
  if (isLocalTransportError(e)) return e;
  if (typeof code === "number" && code < 0 && code > -33000) {
    return new ProtocolError((e as Error).message.replace(/^(MCP error -?\d+:\s*)+/, ""), code);
  }
  return e;
}

function isAuthError(e: unknown): boolean {
  const err = e as { name?: string; code?: unknown; message?: string };
  return err.name === "UnauthorizedError" || err.code === 401 || err.code === 403 || /\b40[13]\b/.test(err.message ?? "");
}

function convertPrompt(p: {
  name: string;
  title?: string | undefined;
  description?: string | undefined;
  arguments?: { name: string; description?: string | undefined; required?: boolean | undefined }[] | undefined;
}): PromptDef {
  const def: PromptDef = {
    name: p.name,
    arguments: (p.arguments ?? []).map((a): PromptArgument => {
      const arg: PromptArgument = { name: a.name, required: a.required === true };
      if (a.description !== undefined) arg.description = a.description;
      return arg;
    }),
  };
  if (p.title !== undefined) def.title = p.title;
  if (p.description !== undefined) def.description = p.description;
  return def;
}

/** Connects, runs `fn`, and always closes the connection (and the child process for stdio). */
export async function withServer<T>(
  spec: ServerSpec,
  opts: ConnectOptions,
  fn: (client: PromptClient) => Promise<T>,
): Promise<T> {
  const t = spec.transport;
  const transport =
    t.kind === "stdio"
      ? new StdioClientTransport({
          command: t.command,
          args: t.args,
          env: { ...process.env, ...t.env } as Record<string, string>,
          cwd: t.cwd ?? opts.cwd ?? process.cwd(),
          stderr: "pipe",
        })
      : new StreamableHTTPClientTransport(new URL(t.url), { requestInit: { headers: t.headers } });

  if (transport instanceof StdioClientTransport) {
    const err = transport.stderr as import("node:stream").Readable | null;
    if (err) {
      if (opts.verbose) err.pipe(process.stderr, { end: false });
      else err.resume();
    }
  }

  const client = new Client({ name: "mcp-prompt-commands", version: VERSION });
  const reqOpts = { timeout: opts.timeoutMs };
  try {
    await client.connect(transport, reqOpts);
  } catch (e) {
    await client.close().catch(() => undefined);
    if (isAuthError(e)) throw new AuthRequiredError((e as Error).message);
    throw e;
  }
  try {
    if (!client.getServerCapabilities()?.prompts) throw new NoPromptsError();
    return await fn({
      async listPrompts() {
        const prompts: PromptDef[] = [];
        let cursor: string | undefined;
        const seen = new Set<string>();
        try {
          for (let pages = 0; ; pages++) {
            const page = await client.listPrompts(cursor === undefined ? {} : { cursor }, reqOpts);
            for (const p of page.prompts) prompts.push(convertPrompt(p));
            cursor = page.nextCursor;
            if (!cursor) break;
            // A repeated cursor or an endless chain of pages would loop forever.
            if (seen.has(cursor) || pages + 1 >= MAX_PAGES) throw new PaginationError(cursor);
            seen.add(cursor);
          }
        } catch (e) {
          throw toProtocolError(e);
        }
        return prompts;
      },
      async getPrompt(name, args) {
        try {
          const r = await client.getPrompt({ name, arguments: args }, reqOpts);
          return { description: r.description, messages: r.messages as unknown as PromptMessage[] };
        } catch (e) {
          throw toProtocolError(e);
        }
      },
    });
  } finally {
    await client.close().catch(() => undefined);
  }
}
