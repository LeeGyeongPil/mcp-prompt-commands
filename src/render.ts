import type { Msg } from "./i18n.js";

/** The parts of an MCP prompt message that rendering needs. */
export interface PromptMessage {
  role: string;
  content: { type: string; [key: string]: unknown };
}

export interface RenderResult {
  text: string;
  warnings: Msg[];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function renderContent(c: PromptMessage["content"], warnings: Msg[]): string {
  switch (c.type) {
    case "text":
      return str(c["text"]);
    case "image":
    case "audio": {
      const mime = str(c["mimeType"]) || "unknown";
      warnings.push({ key: "warn.nontext", params: { type: c.type, detail: mime } });
      return `[${c.type} omitted: ${mime}]`;
    }
    case "resource": {
      const r = (c["resource"] ?? {}) as Record<string, unknown>;
      const uri = str(r["uri"]);
      if (typeof r["text"] === "string") {
        const mime = str(r["mimeType"]);
        return `<resource uri="${uri}"${mime ? ` mimeType="${mime}"` : ""}>\n${r["text"]}\n</resource>`;
      }
      warnings.push({ key: "warn.nontext", params: { type: { key: "content.binary_resource" }, detail: uri } });
      return `[binary resource omitted: ${uri}]`;
    }
    case "resource_link": {
      const uri = str(c["uri"]);
      warnings.push({ key: "warn.nontext", params: { type: "resource_link", detail: uri } });
      return `[resource link not fetched: ${uri}]`;
    }
    default:
      warnings.push({ key: "warn.nontext", params: { type: c.type, detail: "" } });
      return `[${c.type} content omitted]`;
  }
}

/**
 * Renders prompts/get messages as Markdown. A single user message is printed as-is;
 * otherwise each message gets a "### role" heading so speakers stay distinguishable.
 */
export function renderMessages(messages: PromptMessage[]): RenderResult {
  const warnings: Msg[] = [];
  const parts = messages.map((m) => renderContent(m.content, warnings));
  const plain = messages.length === 1 && messages[0]?.role === "user";
  const text = plain
    ? (parts[0] ?? "")
    : messages.map((m, i) => `### ${m.role}\n${parts[i] ?? ""}`).join("\n\n");
  return { text, warnings };
}

/** Replaces each marker value with its replacement. */
export function replaceMarkers(text: string, replacements: Record<string, string>): string {
  let out = text;
  for (const [marker, value] of Object.entries(replacements)) out = out.split(marker).join(value);
  return out;
}
