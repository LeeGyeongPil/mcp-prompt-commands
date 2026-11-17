/** Lowercase [a-z0-9_-] only; everything else becomes "-", repeated "-" collapse. */
export function normalizeName(name: string): string {
  const n = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return n === "" ? "unnamed" : n;
}

export interface Resolved {
  original: string;
  id: string;
  /** True when the plain normalized name was already taken and a suffix was added. */
  collided: boolean;
}

/**
 * Normalizes every name and resolves collisions deterministically: names are processed in
 * sorted order, the first keeps the plain id and later ones get "-2", "-3", ...
 */
export function resolveNames(originals: string[]): Resolved[] {
  const unique = [...new Set(originals)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const used = new Set<string>();
  const out = new Map<string, Resolved>();
  for (const original of unique) {
    const base = normalizeName(original);
    let id = base;
    let n = 1;
    while (used.has(id)) {
      n += 1;
      id = `${base}-${n}`;
    }
    used.add(id);
    out.set(original, { original, id, collided: id !== base });
  }
  return originals.map((o) => out.get(o) as Resolved);
}

/** Finds an item by exact name first, then by its resolved (normalized) id. */
export function findByNameOrId<T extends { name: string }>(items: T[], query: string): T | undefined {
  const exact = items.find((i) => i.name === query);
  if (exact) return exact;
  const resolved = resolveNames(items.map((i) => i.name));
  const hit = resolved.find((r) => r.id === query);
  return hit ? items.find((i) => i.name === hit.original) : undefined;
}

/** Agent Skills spec: lowercase letters, digits and single hyphens, at most 64 characters. */
const SKILL_NAME_MAX = 64;

function skillSlug(s: string, max: number): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/**
 * Builds a spec-valid skill directory/name from "<serverId>-<promptId>": underscores become hyphens,
 * runs collapse, ends are trimmed, and the result is cut to 64 characters. When `taken` already has
 * it, "-2", "-3", ... is appended (suffix included in the 64 characters).
 */
export function skillDirName(serverId: string, promptId: string, taken: ReadonlySet<string>): string {
  const base = skillSlug(`${serverId}-${promptId}`, SKILL_NAME_MAX) || "unnamed";
  let name = base;
  for (let n = 2; taken.has(name); n += 1) {
    const suffix = `-${n}`;
    name = `${skillSlug(base, SKILL_NAME_MAX - suffix.length) || "unnamed"}${suffix}`;
  }
  return name;
}
