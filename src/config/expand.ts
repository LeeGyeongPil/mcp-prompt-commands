export interface ExpandContext {
  env: Record<string, string | undefined>;
  cwd: string;
  /** VS Code files also understand ${workspaceFolder} and ${env:NAME}. */
  vscode: boolean;
}

export interface ExpandResult {
  value: string;
  /** Variables that are unset and have no default. */
  missing: string[];
  /** VS Code ${input:id} references, which need interactive input. */
  inputs: string[];
}

/** Expands ${VAR} and ${VAR:-default}. Unresolvable references are left in place and reported. */
export function expandVars(text: string, ctx: ExpandContext): ExpandResult {
  const missing: string[] = [];
  const inputs: string[] = [];
  const value = text.replace(/\$\{([^}]+)\}/g, (whole, inner: string) => {
    if (inner.startsWith("input:")) {
      inputs.push(inner.slice("input:".length));
      return whole;
    }
    if (ctx.vscode && inner === "workspaceFolder") return ctx.cwd;
    let expr = inner;
    if (ctx.vscode && expr.startsWith("env:")) expr = expr.slice(4);
    const sep = expr.indexOf(":-");
    const name = sep === -1 ? expr : expr.slice(0, sep);
    const fallback = sep === -1 ? undefined : expr.slice(sep + 2);
    const found = ctx.env[name];
    if (found !== undefined) return found;
    if (fallback !== undefined) return fallback;
    missing.push(name);
    return whole;
  });
  return { value, missing, inputs };
}
