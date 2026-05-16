# Flowchart Generator — Build Plan

A Mermaid-style generator that takes a structured Markdown file and renders the "Account Recovery Flow" visual language (the artifact in `Claude.html`) as standalone HTML. Ships in two surfaces: a CLI/static converter (`md → html`) and a live editor (split-pane, type on the left, see the chart on the right).

This plan locks in three things: the **input schema** (what the MD file looks like), the **component inventory** (every visual element the generator can produce), and the **customization surface** (the knobs the author can turn).

Status: parser, validator, renderer, and CLI are shipped. The live editor is the remaining piece.

---

## 1. Input file format

The input is a `.md` file with a YAML frontmatter block, a `## Flow` section that declares nodes and edges as a YAML list, and three trailing sections: `## Terminal States`, `## Audit Events`, `## Footnotes`. Plain Markdown headers organize the file; structured YAML inside fenced code blocks carries the data.

Items in the body are discriminated by a `type:` field. The author writes `type: step`, `type: decision`, `type: fork`, `type: branch`, `type: parallel`, `type: arrow`, `type: terminator`, or `type: reroute`. Nesting is via the `children:` (branch) or `columns:` (parallel) arrays.

### 1.1 Top-level shape

```markdown
---
title: Account Recovery Flow
kicker: self-service device recovery · DEMO MVP · RECOVERY FLOW · WITH AUDIT EVENTS
description: >
  Mobile-initiated recovery using context-aware behavioral questions.
theme: blueprint
direction: TB
max_width: 960
actors:
  user:    { label: USER,    color: "#1e3a8a", icon: user }
  backend: { label: BACKEND, color: "#7c2d12", icon: server }
  manager: { label: MANAGER, color: "#5b21b6", icon: user-cog }
outcomes:
  success: { label: PASS, color: "#059669" }
  blocked: { label: FAIL, color: "#dc2626" }
event_log:
  color: "#b45309"
  text:  "#92400e"
  bg:    "#fffbeb"
---

## Flow

​```yaml
- type: step
  id: "01"
  actor: user
  title: Opens newcore mobile app
  desc: Entry point. App detects unauthenticated state.

- type: step
  id: "02"
  actor: user
  title: Enters username
  side_branch:
    id: "02.async"
    variant: async
    actor: backend
    pill: ASYNC · PARALLEL
    title: Owner notified out-of-band

- type: decision
  label: PASSES THRESHOLD?

- type: fork
  legs:
    - { label: "YES · PASS", color: outcome:success }
    - { label: "NO · FAIL",  color: outcome:blocked }

- type: arrow
  color: outcome:success

- type: branch
  id: "08"
  title: Auto-approved
  accent: outcome:success
  children:
    - type: step
      id: "8.1"
      actor: backend
      title: Pair device
    - type: step
      id: "8.2"
      actor: user
      title: Login confirmation
      outcome: success
    - type: terminator
      color: outcome:success

- type: reroute
  label: DID NOT PASS THRESHOLD
  color: outcome:blocked

- type: branch
  id: "09"
  title: Below threshold
  accent: outcome:blocked
  children:
    - ...
​```

## Terminal States

​```yaml
- outcome: success
  items: ["Auto-approved (8.2)", "Manager-approved (9.1.5)"]
- outcome: blocked
  items: ["Manager denied / timeout (9.1.6)", "No manager path (9.2.1)"]
​```

## Audit Events

​```yaml
- name: recovery.request
  fires_at: ["01"]
- name: recovery.dispute.create
  fires_at: ["02.async"]
  fires_at_display: "async (any time post-02)"
​```

## Footnotes

​```yaml
- label: DEMO SCOPE LIMITATIONS
  body: Caveat text here.
​```
```

### 1.2 Why this shape

The frontmatter is the **style + cast** (theme, palette, who the actors are). The body is the **script** (sequence of steps, decisions, branches, terminals). The two are deliberately split so the same flow can be re-themed without touching content and so the actor palette is declared once instead of repeated on every node.

Items use an explicit `type:` discriminator because the YAML hierarchy carries real visual meaning — a branch's `children:` array is not a flat list, it's the contents of a colored container with its own header strip. Discriminated unions keep parsing unambiguous and let the validator catch bad shapes early.

Node IDs are author-chosen and used for cross-references (audit events' `fires_at` points at step or side-branch IDs; terminal-state items quote IDs in their labels). The generator does not auto-number — the artifact uses 01, 02 ... 8.4, 9.1.5 which mixes flat counters with section-numbered sub-steps, and inferring that algorithmically is fragile. Authors write the IDs they want shown.

Events live in `## Audit Events` only. Each event names the steps where it fires via `fires_at: [<id>, ...]`, and the renderer reverse-maps so the right pill renders on the right step. This is a recent design decision (see [memory: flowchart_generator scoping notes]) — it replaces an earlier draft that had `events: [...]` inline on every step, which forced authors to maintain two parallel lists.

---

## 2. Component inventory

See `COMPONENTS.md` for the full spec with exact strokes, paddings, and Tailwind classes. The short summary:

- **Document chrome:** header (kicker + serif title + lead paragraph + 3px stone-900 divider), legend card pinned to the right.
- **Step nodes:** standard (3px top-stroke), terminal variant when `outcome:` is set (4px top + 2px outcome-colored outer border + outcome pill in chip row), async side-branch (dashed amber, attached via elbow connector).
- **Decisions & branches:** decision chip (hex via clip-path), fork (visual splitter with 2-4 colored legs), branch container (5px colored left border + tinted header strip), parallel block (multi-column container with optional dashed-black labeled tab), reroute (dashed bridge between vertically-stacked branches), terminator (open circle in outcome color).
- **Edges:** default arrows auto-emitted between consecutive steps; explicit arrows when the author wants a label, color, or non-default height. Dashed amber elbow connects side-branches.
- **Footer:** two-card terminal-state summary, amber-bordered audit-event index, prose footnotes with bolded label prefixes.

What's intentionally NOT included: free-floating notes, swimlane columns, curved edges, sub-flow includes. One MD file = one chart.

---

## 3. Customizations

See `COMPONENTS.md §"Customization options"` for the full table. The short list:

- **Frontmatter knobs:** `theme`, `direction`, `max_width`, `actors`, `outcomes`, `event_log` accent palette.
- **Per-step overrides:** `outcome` (promotes to terminal), `pill` (extra chip-row pill), `side_branch` (attaches a side-branch), `id` (required for event injection).
- **Color references** anywhere a color is allowed: hex literal, `outcome:<key>`, or `actor:<key>`.
- **Audit-event registry** in `## Audit Events`: `fires_at` for ID-based pill injection, `fires_at_display` for custom index labels.

Fixed and not customizable: card border widths, fonts, edge geometry, decision-chip shape, header divider, page background. Relaxing any of these is a new theme entry, not a per-doc knob.

Only `theme: blueprint` and `direction: TB` are implemented today. `mono-light`/`mono-dark` themes and `LR` direction are reserved in the schema.

---

## 4. Generator architecture

### 4.1 Pipeline

1. **Parse** (`src/parser.ts`): `gray-matter` for frontmatter, `js-yaml` for each section's fenced YAML block. Produces a typed `FlowDoc` validated by the Zod schema.
2. **Validate** (`src/validate.ts`): semantic checks the schema can't express alone — unknown actor/outcome/color references, duplicate step IDs, undeclared audit events, decision nesting depth (warn at 2+, error at 4+), `fires_at` referencing unknown IDs.
3. **Render** (`src/renderer.ts` + `src/render/`): one component function per visual primitive (`renderStep`, `renderFork`, `renderBranch`, etc.). Emits a single self-contained HTML string. Tailwind ships via Play CDN for now; we can swap to a compiled stylesheet at packaging time.

### 4.2 Two surfaces, one core

- **CLI** (`src/cli.ts`): `flowgen <input.md> [--html] [-o <output>]`. Default prints the FlowDoc as JSON to stdout (good for debugging the input); `--html` emits the rendered HTML.
- **Live editor** (planned): single static page with a textarea on the left, an iframe rendering the chart on the right, debounced re-render on every keystroke. Browser-only — the parser + renderer get bundled with esbuild into a single JS file the page loads. Drag-drop an `.md` file to load; download button to save the rendered HTML.

### 4.3 Tech choices

- **No SVG layout engine**. The artifact is pure HTML+CSS, not SVG. We keep it that way — easier to style, accessible by default, copy-pasteable into Notion / docs. Arrows are tiny inline SVGs.
- **No graph layout library**. Direction is always linear (a single spine plus branches). Hand-coded flex/grid.
- **Tailwind for the output, via Play CDN** for now. Output HTML loads one external script. Pre-compiled stylesheet is a packaging concern, deferred.
- **`html` tagged template** with a `RawHtml` marker type so nested template calls compose without double-escaping. See `src/render/html.ts` for the implementation note.

### 4.4 Validator rules

- **Error**: unknown actor / outcome / color reference; duplicate step or side-branch IDs; `audit_events[].fires_at` pointing at an unknown ID; nesting depth ≥ 4.
- **Warning**: nesting depth = 3 (soft cap exceeded); audit event with empty `fires_at` and no `fires_at_display` (unanchored).

---

## 5. Open questions / v1 cuts

- **Cross-doc event registry**: should the generator be able to read a shared `events.yaml` so the same audit-event catalog can drive multiple flow docs? Probably yes for our actual use case, but cut from v1.
- **Embeddable web component**: ship a `<flow-chart src="…">` custom element for direct embedding in Notion-or-similar tooling. Worth a v1.5.
- **Export to PNG/SVG**: the live editor should at minimum have a "copy as HTML" button. Image export can wait.
- **Re-numbering helper**: a side-tool that rewrites step IDs to a consistent scheme when the author inserts steps mid-flow.
- **Pre-compiled Tailwind**: replace the Play CDN script with a packaged stylesheet so the output is fully offline. Trivial when we set up production packaging.
- **Sub-flow primitive (linked named flows): not shipping.** Capped nesting at 2 levels soft / 3 hard and skip the sub-flow primitive entirely — these diagrams aren't meant to be very complex.

---

## 6. Build order

1. ✅ Lock the parser + validator with a Zod schema and unit tests against `recovery-flow.md` (a port of the reference artifact into the v1 schema).
2. ✅ Build the static renderer (HTML emitter) component-by-component.
3. ✅ Wire the CLI.
4. **In progress:** Build the live editor (textarea + iframe + debounced render, bundled with esbuild).
5. Ship the linter on top of the validator (richer error messages, line/column info from the YAML parser).
