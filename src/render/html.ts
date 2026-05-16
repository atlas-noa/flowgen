// Tiny HTML rendering helpers — escape, tagged template, style/attr builders.
//
// Background on the design: `html` is a tagged template that returns a
// RawHtml marker object (NOT a plain string). The marker tells the
// interpolator "this is already-escaped HTML; don't escape it again." Plain
// string values interpolated into `html` ARE escaped — that's the safe path.
//
// Why the marker matters: a function like renderStep() builds up HTML and
// returns it. When that HTML is interpolated into another `html` template
// (e.g. inside renderBranch), without a marker we can't tell rendered HTML
// from user content, and we'd either double-escape (breaking the output) or
// not escape at all (XSS). The marker lets us distinguish.

export function esc(s: unknown): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RawHtml {
  __raw: string;
  toString(): string;
}

function isRawHtml(v: unknown): v is RawHtml {
  return !!v && typeof v === "object" && "__raw" in (v as object);
}

/**
 * Wrap an already-rendered HTML string so it survives interpolation without
 * being re-escaped. Use this for verbatim HTML fragments (SVG paths, inline
 * styles, etc.).
 */
export function raw(s: string): RawHtml {
  return {
    __raw: s,
    toString() {
      return s;
    },
  };
}

/**
 * Tagged template literal. Escapes interpolated values unless they're
 * RawHtml markers. Returns a RawHtml marker so nested `html` calls compose
 * without re-escaping.
 *
 *   html`<div class="${cls}">${title}</div>`               // cls and title escaped
 *   html`<div>${html`<span>${name}</span>`}</div>`         // inner html passes through
 *   html`<div>${raw(svgString)}</div>`                     // raw passes through
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): RawHtml {
  let out = "";
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) {
      const v = values[i];
      if (isRawHtml(v)) {
        out += v.__raw;
      } else if (Array.isArray(v)) {
        // Arrays of fragments — concat without separators. Inner items are
        // recursively unwrapped (RawHtml passes through; plain values escape).
        out += v
          .map((x) => (isRawHtml(x) ? x.__raw : esc(x)))
          .join("");
      } else {
        out += esc(v);
      }
    }
  });
  return raw(out);
}

/** Build an inline style attribute from a record. Skips undefined entries. */
export function style(props: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${camelToKebab(k)}: ${typeof v === "number" ? `${v}px` : v}`);
  }
  return parts.join("; ");
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function classes(...args: Array<string | false | undefined | null>): string {
  return args.filter(Boolean).join(" ");
}
