import type { FlowDocT } from "./schema.js";
import { buildEventLookup } from "./lookup.js";
import {
  renderHeader,
  renderFlow,
  renderTerminalStates,
  renderAuditIndex,
  renderFootnotes,
  type RenderCtx,
} from "./render/components.js";

// ---------------------------------------------------------------------------
// Top-level render
//
// Emits a single self-contained HTML document from a validated FlowDoc.
// Tailwind v3 ships via CDN for now; we can swap to a compiled stylesheet
// when we ship to production.
// ---------------------------------------------------------------------------

// Single-quoted font names so the value sits cleanly in a double-quoted
// HTML attribute. See the matching note in render/components.ts.
const MONO = `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace`;

export interface RenderOptions {
  /** Inject the Tailwind Play CDN script in the <head>. Default true. */
  includeTailwindCdn?: boolean;
  /** Render only the chart body (no <html>/<head>/<body>). Useful for embedding. */
  bodyOnly?: boolean;
}

export function render(doc: FlowDocT, opts: RenderOptions = {}): string {
  const { includeTailwindCdn = true, bodyOnly = false } = opts;

  const ctx: RenderCtx = {
    doc,
    events: buildEventLookup(doc),
    containerStack: ["root"],
  };

  // Note: no `space-y-*` wrapper around renderFlow. Items handle their own
  // spacing — arrows use `py-1` padding internally, the reroute uses `my-6`
  // to create breathing room between vertically stacked branches, and step
  // cards butt naturally because they carry no outer margin. A `space-y-0`
  // wrapper here would clobber the reroute's `margin-top`, removing the gap.
  const body = `
    <div class="min-h-screen bg-stone-100 p-6" style="font-family: ${MONO}">
      <style>@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');</style>
      <div class="mx-auto" style="max-width: ${doc.frontmatter.max_width}px">
        ${renderHeader(doc)}
        <div>${renderFlow(doc.flow, ctx)}</div>
        ${renderTerminalStates(doc)}
        ${renderAuditIndex(doc)}
        ${renderFootnotes(doc)}
      </div>
    </div>
  `;

  if (bodyOnly) return body;

  const tailwind = includeTailwindCdn
    ? `<script src="https://cdn.tailwindcss.com"></script>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(doc.frontmatter.title)}</title>
  ${tailwind}
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
