// Browser entry point for the live editor.
//
// Bundles to a single IIFE via `npm run build:editor` (esbuild) and is loaded
// by `editor.html` as a regular <script>. Exports a small global `Flowgen`
// API the page calls into.
//
// The DOM contract is fixed in editor.html:
//   #source    — <textarea> the author types into
//   #preview   — <iframe> the rendered chart goes into (srcdoc)
//   #issues    — <div> the validator messages go into
//   #status    — <span> tiny text in the toolbar ("clean" / "N errors")
//   #download  — <button> save the rendered HTML
//   #load      — <input type="file"> to load an .md file
//   #dropzone  — <div> covering the page for drag-drop

import yaml from "js-yaml";
import { parse, ParseError } from "./parser.js";
import { validate, hasErrors, type ValidationIssue } from "./validate.js";
import { render } from "./renderer.js";
import { icon, type IconName } from "./render/icons.js";
import {
  renderFlow,
  renderTerminalStates,
  renderAuditIndex,
  renderFootnotes,
  type RenderCtx,
} from "./render/components.js";
import type { FlowDocT, FlowItemT, FrontmatterT } from "./schema.js";
import { buildEventLookup } from "./lookup.js";

// ---------------------------------------------------------------------------
// Default source — shown the first time the page loads. Pulled inline so the
// bundle has no external file dep at runtime.
// ---------------------------------------------------------------------------

const DEFAULT_SOURCE = `---
title: Account Recovery Flow
kicker: self-service device recovery · DEMO
description: A tiny example flow. Edit the YAML on the left; the chart re-renders on the right.
theme: blueprint
direction: TB
max_width: 960
actors:
  user:    { label: USER,    color: "#1e3a8a", icon: user }
  backend: { label: BACKEND, color: "#7c2d12", icon: server }
outcomes:
  success: { label: PASS, color: "#059669" }
  blocked: { label: FAIL, color: "#dc2626" }
event_log:
  color: "#b45309"
  text:  "#92400e"
  bg:    "#fffbeb"
---

## Flow

- type: step
  id: "01"
  actor: user
  title: Opens app
  desc: Entry point.

- type: step
  id: "02"
  actor: user
  title: Submits username
  desc: Triggers recovery request.

- type: step
  id: "03"
  actor: backend
  title: Compute risk verdict
  desc: Risk Service scores the request.

- type: decision
  label: PASSES THRESHOLD?

- type: fork
  legs:
    - { label: "YES · PASS", color: outcome:success }
    - { label: "NO · FAIL",  color: outcome:blocked }

- type: arrow
  color: outcome:success

- type: branch
  id: "04"
  title: Auto-approved
  accent: outcome:success
  children:
    - type: step
      id: "4.1"
      actor: backend
      title: Pair device
    - type: step
      id: "4.2"
      actor: user
      title: Login confirmation
      outcome: success
    - type: terminator
      color: outcome:success

- type: reroute
  label: DID NOT PASS THRESHOLD
  color: outcome:blocked

- type: branch
  id: "05"
  title: Blocked
  accent: outcome:blocked
  children:
    - type: step
      id: "5.1"
      actor: backend
      title: Finalize + suspend
      outcome: blocked
    - type: terminator
      color: outcome:blocked

## Audit Events

- name: recovery.request
  fires_at: ["02"]
- name: risk.recovery.verdict
  fires_at: ["03"]
`;

// ---------------------------------------------------------------------------
// Pipeline — parse + validate + render, returning everything the page needs
// in one pass so we can debounce a single call rather than three.
// ---------------------------------------------------------------------------

interface PipelineResult {
  html: string;
  issues: ValidationIssue[];
  fatal?: string;
}

function runPipeline(source: string): PipelineResult {
  try {
    const doc = parse(source);
    const issues = validate(doc);
    const html = render(doc);
    return { html, issues };
  } catch (err) {
    const msg =
      err instanceof ParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return { html: "", issues: [], fatal: msg };
  }
}

// ---------------------------------------------------------------------------
// DOM wiring
// ---------------------------------------------------------------------------

interface El<T extends HTMLElement> {
  el: T;
}

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`expected #${id} in the document`);
  return el as T;
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number): F {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}

function renderIssues(target: HTMLElement, statusEl: HTMLElement, result: PipelineResult): void {
  target.innerHTML = "";
  if (result.fatal) {
    const div = document.createElement("div");
    div.className = "issue fatal";
    div.textContent = `parse error: ${result.fatal}`;
    target.appendChild(div);
    statusEl.textContent = "parse error";
    statusEl.dataset.kind = "error";
    return;
  }
  const errs = result.issues.filter((i) => i.severity === "error");
  const warns = result.issues.filter((i) => i.severity === "warning");
  for (const issue of result.issues) {
    const div = document.createElement("div");
    div.className = `issue ${issue.severity}`;
    const path = document.createElement("code");
    path.textContent = issue.path;
    div.append(`[${issue.severity}] `, path, ` — ${issue.message}`);
    target.appendChild(div);
  }
  if (errs.length === 0 && warns.length === 0) {
    statusEl.textContent = "clean";
    statusEl.dataset.kind = "ok";
  } else if (errs.length > 0) {
    statusEl.textContent = `${errs.length} error${errs.length === 1 ? "" : "s"}${warns.length ? `, ${warns.length} warning${warns.length === 1 ? "" : "s"}` : ""}`;
    statusEl.dataset.kind = "error";
  } else {
    statusEl.textContent = `${warns.length} warning${warns.length === 1 ? "" : "s"}`;
    statusEl.dataset.kind = "warn";
  }
}

// ---------------------------------------------------------------------------
// Cheatsheet content
//
// Source of truth for the in-editor component reference. Anything added to
// the schema should get a row here so authors can discover it without
// leaving the editor.
// ---------------------------------------------------------------------------

const ACTOR_ICONS: IconName[] = [
  "user",
  "server",
  "user-cog",
  "shield",
  "database",
  "cog",
  "bot",
  "tag",
];

interface Snippet {
  label: string;
  desc: string;
  code: string;
  /**
   * How the preview is rendered. Component snippets (`flow`) get parsed as
   * an array of FlowItems. Section snippets (`terminals`/`events`/`footnotes`)
   * call the matching renderer directly with a small synthetic doc.
   */
  kind: "flow" | "terminals" | "events" | "footnotes";
}

// ---------------------------------------------------------------------------
// Preview rendering — uses the real component renderers so the cheatsheet
// reflects the same visual language as the live chart. PREVIEW_FRONTMATTER
// gives the snippets a consistent palette (USER blue, BACKEND brown, MANAGER
// purple, PASS green, FAIL red, amber event log) — same as the canonical
// recovery flow.
// ---------------------------------------------------------------------------

const PREVIEW_FRONTMATTER: FrontmatterT = {
  title: "Preview",
  theme: "blueprint",
  direction: "TB",
  max_width: 960,
  actors: {
    user: { label: "USER", color: "#1e3a8a", icon: "user" },
    backend: { label: "BACKEND", color: "#7c2d12", icon: "server" },
    manager: { label: "MANAGER", color: "#5b21b6", icon: "user-cog" },
  },
  outcomes: {
    success: { label: "PASS", color: "#059669" },
    blocked: { label: "FAIL", color: "#dc2626" },
  },
  event_log: { color: "#b45309", text: "#92400e", bg: "#fffbeb" },
};

function previewCtx(doc: FlowDocT): RenderCtx {
  return {
    doc,
    events: buildEventLookup(doc),
    containerStack: ["root"],
  };
}

/**
 * Strip a leading `## Heading\n\n` from a snippet body so just the YAML
 * remains. Section snippets carry the heading for the copy button; the
 * preview doesn't need it.
 */
function stripHeading(code: string): string {
  return code.replace(/^##\s+.+\r?\n+/, "");
}

function safePreview(snippet: Snippet): string {
  try {
    return renderPreviewFor(snippet);
  } catch (err) {
    return `<div class="cs-preview-error">preview unavailable: ${escapeHtml(
      (err as Error).message ?? String(err),
    )}</div>`;
  }
}

function renderPreviewFor(snippet: Snippet): string {
  const data = yaml.load(stripHeading(snippet.code));

  switch (snippet.kind) {
    case "flow": {
      if (!Array.isArray(data)) return "";
      const items = data as FlowItemT[];
      const doc: FlowDocT = {
        frontmatter: PREVIEW_FRONTMATTER,
        flow: items,
        terminal_states: [],
        audit_events: [],
        footnotes: [],
      };
      return renderFlow(items, previewCtx(doc)).__raw;
    }
    case "terminals": {
      const doc: FlowDocT = {
        frontmatter: PREVIEW_FRONTMATTER,
        flow: [],
        terminal_states: Array.isArray(data) ? (data as FlowDocT["terminal_states"]) : [],
        audit_events: [],
        footnotes: [],
      };
      return renderTerminalStates(doc).__raw;
    }
    case "events": {
      const doc: FlowDocT = {
        frontmatter: PREVIEW_FRONTMATTER,
        flow: [],
        terminal_states: [],
        audit_events: Array.isArray(data) ? (data as FlowDocT["audit_events"]) : [],
        footnotes: [],
      };
      return renderAuditIndex(doc).__raw;
    }
    case "footnotes": {
      const doc: FlowDocT = {
        frontmatter: PREVIEW_FRONTMATTER,
        flow: [],
        terminal_states: [],
        audit_events: [],
        footnotes: Array.isArray(data) ? (data as FlowDocT["footnotes"]) : [],
      };
      return renderFootnotes(doc).__raw;
    }
  }
}

const COMPONENT_SNIPPETS: Snippet[] = [
  {
    label: "step",
    desc: "The workhorse rectangle. Actor chip, ID, title, optional desc.",
    code: `- type: step
  id: "01"
  actor: user
  title: Opens app
  desc: Optional secondary line.`,
    kind: "flow",
  },
  {
    label: "step (terminal)",
    desc: "Closes a path. Heavy outcome-colored border + outcome pill.",
    code: `- type: step
  id: "8.4"
  actor: user
  title: Confirmation screen
  outcome: success`,
    kind: "flow",
  },
  {
    label: "step.side_branch",
    desc: "Async callout attached to a parent step via a dashed amber elbow.",
    code: `- type: step
  id: "03"
  actor: user
  title: Submits username
  side_branch:
    id: "03.async"
    variant: async
    actor: backend
    pill: ASYNC · PARALLEL
    title: Owner notified out-of-band
    desc: Optional description.
    trailing_note: ↳ optional italic gray note`,
    kind: "flow",
  },
  {
    label: "decision + fork",
    desc: "A question and its visual splitter. Always used together.",
    code: `- type: decision
  label: PASSES THRESHOLD?

- type: fork
  legs:
    - { label: "YES · PASS", color: outcome:success }
    - { label: "NO · FAIL",  color: outcome:blocked }`,
    kind: "flow",
  },
  {
    label: "branch",
    desc: "Colored-left-border container holding the steps of one branch.",
    code: `- type: branch
  id: "08"
  title: Auto-approved
  subtitle: Optional context note
  accent: outcome:success
  children:
    - type: step
      id: "8.1"
      actor: backend
      title: First step in branch
    - type: terminator
      color: outcome:success`,
    kind: "flow",
  },
  {
    label: "arrow (explicit)",
    desc: "Only needed when you want a label, color, or non-default height. Plain arrows between consecutive steps are auto-emitted.",
    code: `- type: arrow
  label: CHALLENGE READY
  # color: outcome:success
  # height: 14`,
    kind: "flow",
  },
  {
    label: "parallel (labeled)",
    desc: "Two-column container with a dashed-black labeled tab.",
    code: `- type: parallel
  label: STEPS 04 + 05 · PARALLEL
  columns:
    - label: STEP 04 · USER SEES
      children:
        - type: step
          id: "04"
          actor: user
          title: Reads primer
    - label: STEP 05 · BACKEND PREP
      children:
        - type: step
          id: "5.1"
          actor: backend
          title: Poll context systems`,
    kind: "flow",
  },
  {
    label: "parallel (unlabeled)",
    desc: "Lay sub-branches side by side inside a parent branch.",
    code: `- type: parallel
  label: ""
  columns:
    - children:
        - type: branch
          id: "9.1"
          title: Manager path
          accent: actor:manager
          children:
            - type: step
              id: "9.1.1"
              actor: manager
              title: Approves request
              outcome: success
            - type: terminator
              color: outcome:success
    - children:
        - type: branch
          id: "9.2"
          title: No manager path
          accent: outcome:blocked
          children:
            - type: step
              id: "9.2.1"
              actor: backend
              title: Suspend account
              outcome: blocked
            - type: terminator
              color: outcome:blocked`,
    kind: "flow",
  },
  {
    label: "terminator",
    desc: "Small open circle marking the end of a path. Usually follows a terminal step.",
    code: `- type: terminator
  color: outcome:success`,
    kind: "flow",
  },
  {
    label: "reroute",
    desc: "Dashed bridge between two vertically stacked branches.",
    code: `- type: reroute
  label: DID NOT PASS THRESHOLD
  description: Optional gray subtext.
  color: outcome:blocked`,
    kind: "flow",
  },
];

const SECTION_SNIPPETS: Snippet[] = [
  {
    label: "## Terminal States",
    desc: "Footer cards summarizing where each outcome ends up.",
    code: `## Terminal States

- outcome: success
  items:
    - "Auto-approved (8.4)"
    - "Manager-approved (9.1.5)"
- outcome: blocked
  items:
    - "Manager denied (9.1.6)"
    - "No manager path (9.2.1)"`,
    kind: "terminals",
  },
  {
    label: "## Audit Events",
    desc: "The event registry. fires_at points at step or side-branch IDs; event pills are injected automatically. Use fires_at_display for non-ID labels.",
    code: `## Audit Events

- name: recovery.request
  fires_at: ["03"]
- name: recovery.complete
  fires_at: ["8.3", "9.1.5", "9.1.6"]
- name: recovery.dispute.create
  fires_at: ["03.async"]
  fires_at_display: "async (any time post-03)"`,
    kind: "events",
  },
  {
    label: "## Footnotes",
    desc: "Caveats and notes at the bottom of the document.",
    code: `## Footnotes

- label: DEMO SCOPE LIMITATIONS
  body: Caveats here.
- label: RISK SIGNALS IN SCOPE
  body: privilege level · lifecycle status · known device`,
    kind: "footnotes",
  },
];

function renderCheatsheet(): string {
  // Helper: render one snippet card with its YAML and a rendered preview.
  const snippetCard = (s: Snippet) => {
    const preview = safePreview(s);
    return `
    <div class="cs-snippet">
      <div class="label">
        <span>${escapeHtml(s.label)}</span>
        <span class="desc">${escapeHtml(s.desc)}</span>
        <span class="spacer"></span>
        <button class="copy" type="button" data-copy="${escapeAttr(s.code)}">Copy</button>
      </div>
      <pre>${escapeHtml(s.code)}</pre>
      ${preview ? `<div class="cs-preview"><div class="cs-preview-label">Preview</div>${preview}</div>` : ""}
    </div>`;
  };

  // Helper: render the actor-icon grid.
  const iconGrid = ACTOR_ICONS.map(
    (name) =>
      `<div class="icon-chip">${icon(name, { size: 14, strokeWidth: 2, color: "#1c1917" })}<code>${name}</code></div>`,
  ).join("");

  return `
    <section class="cs-section">
      <h2>Actor icons</h2>
      <p>Eight options. Reference them by key in <code>frontmatter.actors.&lt;key&gt;.icon</code>.</p>
      <div class="cs-icon-row">${iconGrid}</div>
    </section>

    <section class="cs-section">
      <h2>Component types · ## Flow</h2>
      <p>The eight first-class items you can use under <code>## Flow</code>, plus the <code>side_branch</code> sub-property of a step.</p>
      ${COMPONENT_SNIPPETS.map(snippetCard).join("")}
    </section>

    <section class="cs-section">
      <h2>Trailing sections</h2>
      <p>Optional sections that come after <code>## Flow</code>. All accept YAML directly (no fences needed) or fenced ${"```"}yaml blocks if you prefer.</p>
      ${SECTION_SNIPPETS.map(snippetCard).join("")}
    </section>

    <section class="cs-section cs-color-refs">
      <h2>Color references</h2>
      <p>Anywhere a color is allowed (fork legs, branch accent, arrow color, terminator color, reroute color):</p>
      <ul>
        <li><code>outcome:&lt;key&gt;</code> — resolves to the <code>color</code> of that outcome.</li>
        <li><code>actor:&lt;key&gt;</code> — resolves to the <code>color</code> of that actor.</li>
        <li><code>"#1e3a8a"</code> — a hex literal.</li>
      </ul>
      <p>The validator catches references to outcomes or actors that aren't declared in frontmatter.</p>
    </section>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function wireCheatsheet(): void {
  const openBtn = document.getElementById("cheatsheet-open");
  const closeBtn = document.getElementById("cheatsheet-close");
  const modal = document.getElementById("cheatsheet");
  const body = document.getElementById("cheatsheet-body");
  if (!openBtn || !closeBtn || !modal || !body) return;

  // Populate once on first open (cheap, but no need to do it on boot).
  let populated = false;
  const populate = () => {
    if (populated) return;
    body.innerHTML = renderCheatsheet();
    body.querySelectorAll<HTMLButtonElement>("button.copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const text = btn.dataset.copy ?? "";
        try {
          await navigator.clipboard.writeText(text);
          btn.dataset.state = "copied";
          btn.textContent = "Copied";
          setTimeout(() => {
            delete btn.dataset.state;
            btn.textContent = "Copy";
          }, 1400);
        } catch {
          btn.textContent = "Press ⌘C";
        }
      });
    });
    populated = true;
  };

  const open = () => {
    populate();
    modal.classList.add("open");
  };
  const close = () => modal.classList.remove("open");

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) close();
  });
}

function bootEditor(): void {
  const source = $<HTMLTextAreaElement>("source");
  const preview = $<HTMLIFrameElement>("preview");
  const issues = $<HTMLDivElement>("issues");
  const status = $<HTMLSpanElement>("status");
  const download = $<HTMLButtonElement>("download");
  const loadInput = $<HTMLInputElement>("load");
  const dropzone = $<HTMLDivElement>("dropzone");

  source.value = DEFAULT_SOURCE;

  let lastHtml = "";

  const update = () => {
    const result = runPipeline(source.value);
    renderIssues(issues, status, result);
    if (result.html) {
      lastHtml = result.html;
      preview.srcdoc = result.html;
    }
  };

  const debounced = debounce(update, 200);
  source.addEventListener("input", debounced);

  // Initial render.
  update();

  download.addEventListener("click", () => {
    if (!lastHtml) return;
    const blob = new Blob([lastHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flowchart.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Load button — open file picker, read the file, populate the textarea.
  loadInput.addEventListener("change", async () => {
    const file = loadInput.files?.[0];
    if (!file) return;
    source.value = await file.text();
    update();
  });

  // Drag-drop loading.
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragDepth++;
    dropzone.classList.add("active");
  });
  window.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragDepth--;
    if (dragDepth <= 0) dropzone.classList.remove("active");
  });
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove("active");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    source.value = await file.text();
    update();
  });

  wireCheatsheet();
}

// Boot on DOM ready.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootEditor);
} else {
  bootEditor();
}
