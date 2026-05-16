# flowgen

Structured flowcharts from Markdown. Authors write YAML-in-Markdown; the generator emits a self-contained HTML chart with consistent typography, actor chips, audit-event annotations, decision branches, and a terminal-state summary.

Built for documenting product flows, recovery paths, escalation trees, approval workflows — any flow that's mostly linear with a few branches and where consistency matters more than infinite layout flexibility.

## Quick start (teammates)

1. Open [the live editor](./editor.html).
2. Write your flow on the left (or drag-drop an existing `.md` file).
3. Hit **Components ↗** in the toolbar to see every available block with a copyable YAML snippet and a rendered preview.
4. Hit **Download HTML** to save the chart as a self-contained file. Drop it into Notion, email it, share the link, whatever.

The editor runs entirely in your browser — no data leaves your machine.

## What the input looks like

```markdown
---
title: Account Recovery Flow
kicker: DEMO MVP · RECOVERY FLOW
actors:
  user:    { label: USER,    color: "#1e3a8a", icon: user }
  backend: { label: BACKEND, color: "#7c2d12", icon: server }
outcomes:
  success: { label: PASS, color: "#059669" }
  blocked: { label: FAIL, color: "#dc2626" }
---

## Flow

- type: step
  id: "01"
  actor: user
  title: Opens app

- type: step
  id: "02"
  actor: user
  title: Submits username

- type: decision
  label: PASSES THRESHOLD?

- type: fork
  legs:
    - { label: "YES · PASS", color: outcome:success }
    - { label: "NO · FAIL",  color: outcome:blocked }
```

Full spec: [COMPONENTS.md](./COMPONENTS.md). Build-plan history: [PLAN.md](./PLAN.md).

## Local development (contributors)

```bash
git clone <this-repo>
cd flowchart_template
npm install
npm test                # 35+ parser + renderer tests
npm run render          # rebuild recovery-flow.html from the fixture
npm run build:editor    # rebuild editor.bundle.js after src/ changes
```

### Layout

```
src/
  schema.ts            Zod schema + types for FlowDoc
  parser.ts            MD → FlowDoc (frontmatter splitter + js-yaml)
  validate.ts          semantic checks (color refs, dup IDs, nesting cap)
  lookup.ts            audit-event lookup helpers
  renderer.ts          top-level render(doc) → HTML
  render/
    components.ts      one function per visual primitive
    icons.ts           inline lucide SVGs
    colors.ts          color reference resolver
    html.ts            tagged-template helper with raw-marker support
  cli.ts               flowgen CLI (JSON dump + --html mode)
  editor-entry.ts      browser entry for editor.html

test/
  parser.test.ts       parser + validator behavior
  renderer.test.ts     renderer smoke tests
  fixtures/
    recovery-flow.md   the canonical example flow

COMPONENTS.md          full visual + customization spec
PLAN.md                build plan and architecture notes

editor.html            live editor (deployed to GitHub Pages)
editor.bundle.js       bundled browser code for the editor
index.html             landing page (deployed to GitHub Pages)
recovery-flow.html     rendered example (deployed to GitHub Pages)
```

### Scripts

| Command | What it does |
|---|---|
| `npm test` | vitest run, 35+ tests across parser/validator/renderer |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run parse <file.md>` | parse and dump the FlowDoc as JSON |
| `npm run render` | rebuild `recovery-flow.html` from the fixture |
| `npm run build` | compile TS to `dist/` |
| `npm run build:editor` | bundle `src/editor-entry.ts` → `editor.bundle.js` (esbuild) |
| `npm run editor` | build the editor bundle, prints next steps |

## Deployment

The site is fully static — three files do the job: `index.html`, `editor.html`, `editor.bundle.js`. Push the repo to GitHub, enable Pages, share the URL.

After any change to `src/`:

```bash
npm run build:editor
git add editor.bundle.js
git commit -m "rebuild editor bundle"
git push
```

GitHub Pages picks up the change in ~30 seconds. There's no CI build step required (though we could add one later if rebuilding-on-push gets tedious).

## Conventions

- **Visual language is fixed on purpose.** Strokes, fonts, decision-chip shape, and edge geometry are not author-customizable. The point of the tool is consistency across team docs. New themes (e.g. mono-light, mono-dark) live in code, not per-doc YAML.
- **Decisions can nest 2 levels (soft) or 3 levels (hard cap).** Anything deeper, redesign the flow — don't decompose into sub-flows.
- **Events live in `## Audit Events` only.** Each event's `fires_at: [step_id, ...]` is the single source of truth; the renderer injects pills onto the matching steps. Authors don't repeat event names inline.
- **Step IDs are author-supplied.** The numbering scheme (`8.4`, `9.1.5`, etc.) is whatever the author wants — the renderer just verifies uniqueness.
