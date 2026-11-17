import { en } from "./locales/en.js";
import { ko } from "./locales/ko.js";

export type Lang = "en" | "ko";
export type MessageKey = keyof typeof en;
/**
 * A placeholder value is plain text, a number, or another message. A nested message is
 * rendered in the same language as the outer one, so a reason inside a warning never
 * falls back to English.
 */
export type ParamValue = string | number | Msg;
export type Params = Record<string, ParamValue>;

/** A translatable message: a catalog key plus values for its {placeholders}. */
export interface Msg {
  key: MessageKey;
  params?: Params;
}

export function isMsg(v: unknown): v is Msg {
  return typeof v === "object" && v !== null && typeof (v as { key?: unknown }).key === "string";
}

export const catalogs: Record<Lang, Record<MessageKey, string>> = { en, ko };

export const LANG_ENV = "MCP_PROMPT_COMMANDS_LANG";

function pickLang(value: string | undefined): Lang | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "") return undefined;
  return v.startsWith("ko") ? "ko" : "en";
}

/**
 * Language order: --lang flag, MCP_PROMPT_COMMANDS_LANG, LC_ALL, LC_MESSAGES, LANG.
 * The first variable that is set decides; anything that is not Korean means English.
 */
export function resolveLang(flag: string | undefined, env: Record<string, string | undefined>): Lang {
  for (const candidate of [flag, env[LANG_ENV], env["LC_ALL"], env["LC_MESSAGES"], env["LANG"]]) {
    const lang = pickLang(candidate);
    if (lang) return lang;
  }
  return "en";
}

export function isLangFlag(value: string): boolean {
  return value === "en" || value === "ko";
}

export function format(lang: Lang, key: MessageKey, params: Params = {}): string {
  const template = catalogs[lang][key];
  // One pass over the template: values are inserted as-is and never scanned again.
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    // 중첩 메시지는 바깥 메시지와 같은 언어로 렌더한다(한국어 출력에 영어 문장이 섞이지 않게).
    return isMsg(v) ? render(lang, v) : String(v);
  });
}

export type Translate = (key: MessageKey, params?: Params) => string;

export function translator(lang: Lang): Translate {
  return (key, params) => format(lang, key, params);
}

export function render(lang: Lang, msg: Msg): string {
  return format(lang, msg.key, msg.params);
}
