import type { FrontmatterT } from "../schema.js";

// ---------------------------------------------------------------------------
// Color reference resolution
//
// A `ColorRef` string anywhere in the body can be:
//   - a hex literal:        "#dc2626"
//   - an outcome reference: "outcome:success"
//   - an actor reference:   "actor:manager"
//
// resolveColor() returns the final hex. Pre-parse validation already caught
// dangling refs; we throw here only on truly malformed input.
// ---------------------------------------------------------------------------

export function resolveColor(ref: string, fm: FrontmatterT): string {
  if (ref.startsWith("#")) return ref;
  if (ref.startsWith("outcome:")) {
    const key = ref.slice("outcome:".length);
    const o = fm.outcomes[key];
    if (!o) throw new Error(`unknown outcome '${key}' in color ref`);
    return o.color;
  }
  if (ref.startsWith("actor:")) {
    const key = ref.slice("actor:".length);
    const a = fm.actors[key];
    if (!a) throw new Error(`unknown actor '${key}' in color ref`);
    return a.color;
  }
  throw new Error(`malformed color ref: ${ref}`);
}

/**
 * Hex + alpha → rgba string, e.g. withAlpha("#059669", 0.03) → "rgba(5,150,105,0.03)".
 * Matches the canonical TSX pattern of `${color}08` / `${color}40` for tinted backgrounds.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
