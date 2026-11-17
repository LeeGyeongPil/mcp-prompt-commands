import type { Msg } from "./i18n.js";

export type Source = "claude-local" | "claude-project" | "vscode" | "claude-user" | "codex";
export type SourceGroup = "claude" | "vscode" | "codex";

export type Transport =
  | { kind: "stdio"; command: string; args: string[]; env: Record<string, string>; cwd?: string }
  | { kind: "http"; url: string; headers: Record<string, string> };

export interface ServerSpec {
  name: string;
  source: Source;
  file: string;
  transport: Transport;
}

export interface SkippedServer {
  name: string;
  source: Source;
  file: string;
  reason: Msg;
}

export interface PromptArgument {
  name: string;
  description?: string;
  required: boolean;
}

export interface PromptDef {
  name: string;
  title?: string;
  description?: string;
  arguments: PromptArgument[];
}

export type Format = "commands" | "skills";
export type Mode = "live" | "static" | "agent";
