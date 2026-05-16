# Components & Customization Options

Reference spec for the flowchart generator. Every visual element is listed here with its exact properties (colors, strokes, typography) and the input that produces it. Everything not on this list is out of scope for v1.

---

## Components

### A. Document chrome

**A1. Header block**
The page's title strip. Renders three lines stacked left, with the legend card pinned to its right.

- Kicker — `text-[10px]` tracked `0.3em` uppercase, `text-stone-500`, JetBrains Mono. Source: frontmatter `kicker`.
- Title — `text-4xl font-bold tracking-tight`, color `text-stone-900`, font `ui-serif, Georgia, serif`. Source: frontmatter `title`.
- Lead paragraph — `text-[11px] text-stone-600 leading-relaxed`, max-width `max-w-3xl`, JetBrains Mono. Source: frontmatter `description`.
- Divider — `border-bottom: 3px solid rgb(12, 10, 9)` under the whole block. Fixed.

**A2. Legend card**
Bordered card listing the actor palette, outcome palette, and one sample audit-event pill so readers can decode the chart.

- Container — `bg-white border-2 border-stone-900 p-3 min-w-[260px]`.
- Section title — `LEGEND`, `text-[9px] font-bold tracking-[0.25em] text-stone-500`, divider under it.
- Sections separated by `border-t border-stone-200`.
- Auto-generated from `actors`, `outcomes`, and `event_log` frontmatter blocks.

### B. Step nodes

**B1. Standard step**
The default rectangle, used for every step on the main spine.

- Border — `border-width: 3px 1px 1px; border-style: solid; border-color: rgb(28, 25, 23)`. Heavy top stroke is the signature.
- Background — `bg-white`.
- Padding — `px-3 py-2.5`.
- Chip row — actor chip + step-number badge (`tabular-nums tracking-wider text-stone-500`) + optional `pill`.
- Title — `text-[13px] font-bold text-stone-900 leading-tight`, JetBrains Mono.
- Description — `text-[11px] text-stone-600 leading-snug`, optional.
- Event pills (when the step's `id` is referenced by an audit event's `fires_at`) — attached below the description with a `1px dashed` amber divider. See §"Audit event registry" for how events get injected.

**B2. Terminal step (step with `outcome:`)**
A step that closes a path. Set `outcome: <key>` on any step to promote it.

- Border — `2px solid <outcome-color>` on sides + bottom, `border-top-width: 4px` (heavier top to keep the signature top-stroke feel).
- Chip row gains a right-aligned outcome pill (`PASS`/`FAIL`/etc., `bg-color = outcome-color`, white text).
- A `Terminator` element (B4) usually follows it to mark the end of the path.

**B3. Side-branch (async / parallel)**
Indented variant used for work that happens off the main spine. Attached as a property of a parent step (`side_branch: { ... }`) and connected via a dashed amber elbow.

- Connector — inline SVG path `M 10 0 L 10 20 L 20 20`, stroke `#92400E`, `stroke-width: 2`, `stroke-dasharray: 3 3`.
- Container — `border: 2px dashed rgb(180, 83, 9)`, `background-color: rgb(255, 251, 235)`.
- Chip row optionally shows a tracked-uppercase pill (e.g. `ASYNC · PARALLEL`) and a `triangle-alert` icon when `variant: async`.
- Carries an optional `id`. When set, an audit event's `fires_at` can reference it to inject pills on the side branch (same mechanism as B1).
- Optional `trailing_note` italic text shown alongside the event pill row.

**B4. Terminator**
Small open circle marking the end of a path. Lives at the bottom of a branch container below a terminal step.

- `w-3 h-3 rounded-full`, `border: 2px solid <outcome-color>`, white fill.
- Vertical padding `py-1`.

### C. Decisions, forks, branches

**C1. Decision chip**
Hexagonal call-out that asks the routing question. Pure label — does not produce visual branching by itself; pair with a Fork (C2) below it.

- Shape — `clip-path: polygon(10px 0, calc(100%-10px) 0, 100% 50%, calc(100%-10px) 100%, 10px 100%, 0 50%)`.
- Background — `rgb(12, 10, 9)` (near-black).
- Label — `text-[11px] tracking-[0.2em] font-bold px-5 py-2 text-white`, JetBrains Mono, ALL CAPS.

**C2. Fork**
The visual splitter that fans the spine out into two or more colored legs. Always follows a Decision.

- Top — 2px black vertical line of height 14 (the spine continuation).
- Mid — horizontal 2px black bar splitting into N grid columns.
- Each leg — 2px colored vertical line → colored path-label chip (`text-[9px] tracked-uppercase`, white text, leg color background) → 2px colored line → filled triangle arrowhead (`12×10`, leg color fill).
- Supports 2-4 legs. Two is the common case (`leftLabel/rightLabel`); three or four render as evenly-spaced columns.

**C3. Branch container**
Card that wraps every step belonging to one branch of a decision.

- Border — `border-width: 1px 1px 1px 5px; border-style: solid`, color `rgba(<accent>, 0.25)` for the thin sides + bottom and the full accent color for the 5px left stroke.
- Header strip — flex row inside the top: step-number badge (accent-colored bg, white text), branch name (`text-[11px] font-bold tracking-[0.1em] uppercase`, accent-colored text), optional right-aligned subtitle (`text-[10px] text-stone-500`).
- Header strip background — `rgba(<accent>, 0.03)` tint, divider `border-color: rgba(<accent>, 0.19)`.
- Body — `p-4 space-y-2`, contains nested flow items (steps, decisions, forks, terminators).
- Accent can be an `outcome:<key>`, `actor:<key>`, or hex literal — branches don't have to be outcome-colored (e.g. the canonical Manager branch uses `actor:manager` purple).

**C4. Parallel block**
Multi-column container. Two uses:
- *Labeled* (`label: "STEPS 04 + 05 · PARALLEL"`) — renders the dashed-black outer box with a black "tab" label peeking above. Each column gets a tracked-uppercase title.
- *Unlabeled* (`label: ""`) — renders a plain `grid md:grid-cols-N gap-4` row of columns. Used to lay sibling branches side-by-side inside a parent branch.

Columns themselves are arrays of flow items, so they can contain steps, nested branches, sub-decisions — anything.

**C5. Reroute**
Special bridge between two vertically-stacked branches (e.g. PASS branch closes → reroute → FAIL branch opens). Provides visual breathing room and a "you are diverting here" cue.

- Container — `border: 2px dashed <outcome-color>`, `my-6` (24px top + bottom margin).
- Left icon block — `w-8 h-8` solid-colored square with a white right-turn arrow inside.
- Body — bold tracked-uppercase label in the outcome color, optional gray description below.
- Right arrow — a colored down-pointing chevron stack.

### D. Edges (default and labeled arrows)

**D1. Default arrow (auto-emitted)**
The connector between consecutive items on the spine. *Not written explicitly in the input* — see §"Implicit arrows" for the auto-emit rule.

- Line — `<div>` with `width: 2px`, height by context (see §"Implicit arrows"), `background-color: rgb(28, 25, 23)`.
- Arrowhead — inline SVG `<path d="M 0 0 L 12 0 L 6 10 Z" fill="#1c1917">` (12×10 filled triangle, point down).

**D2. Labeled / colored arrow (explicit)**
Written explicitly in the input via `- type: arrow` with `label:`, `color:`, or `height:`. Same geometry as D1 plus an optional inline pill between the line and the arrowhead (`tracked-uppercase`, white text, arrow color background).

**D3. Async elbow connector**
The dashed amber bracket from a parent step into a side-branch node (B3). Rendered automatically when a step has a `side_branch:` attached.

- SVG path `M 10 0 L 10 20 L 20 20`, `stroke #92400E`, `stroke-width 2`, `stroke-dasharray 3 3`.

### E. Footer sections

**E1. Terminal-state summary**
One card per outcome family laid out as `md:grid-cols-2`.

- Same `border-width: 1px 1px 1px 5px` pattern as C3, tinted to the outcome color.
- Title — `text-[9px] font-bold tracking-[0.25em]` in the outcome color (e.g. `PASS · 2 TERMINAL STATES`).
- Body — `text-[11px] text-stone-700`, list of terminal labels separated by ` · `.

**E2. Audit event index**
Bordered panel listing every audit event with the step(s) it fires at. Acts as the doc's event glossary.

- Container — `bg-white p-4`, `border: 2px solid rgb(180, 83, 9)`.
- Section title — flex row with the lucide `file-text` icon and the label `AUDIT EVENT INDEX · N EVENTS`, `text-[9px] font-bold tracking-[0.25em]` in amber `#92400E`, divider `border-bottom: 1px dashed rgb(180, 83, 9)`.
- Each event — event pill on the left, step-id list (or `fires_at_display` override) right-aligned in `text-stone-500 tabular-nums`.

**E3. Footnotes**
Bottom prose strip for caveats, scope notes, terminology comments.

- `border-top: 2px solid rgb(28, 25, 23)`, `text-[10px] text-stone-500 leading-relaxed`, mono.
- Each entry is a `<p>` with a bolded `<span>LABEL ·</span>` prefix followed by the body.

---

## Implicit arrows

Authors do not write a `- type: arrow` between every two steps. The renderer emits a default arrow between any two consecutive `step` items in the same container. An author writes an explicit `- type: arrow` only when they want a custom label, color, or height.

**Default arrow height varies by context:**

- Main spine (top level of `## Flow`): 20px.
- Inside a branch container (C3): 10px.
- Inside a parallel column (C4): 8px.

The renderer tracks the surrounding container stack and picks the height automatically. Authors can override with `height: <px>` on an explicit arrow.

**Where implicit arrows are NOT emitted:** between a step and a non-step item (decision, fork, branch, parallel, reroute). Those have their own visual transitions — a decision sits directly below its predecessor with no connector, a fork generates its own colored legs, etc. If you want a labeled connector before a parallel or branch (e.g. `ENTER STEPS 04 + 05`), write an explicit `- type: arrow` with a `label:`.

---

## Audit event registry

Audit events are declared *once* in `## Audit Events`. Each entry can name the step (or side-branch) IDs where it fires via `fires_at: [...]`. The renderer reverse-maps this so each step still shows the event pills attached to it — but the author writes the event name in one place.

```yaml
- name: recovery.complete
  fires_at: ["8.3", "9.1.5", "9.1.6", "9.2.1"]
```

When `fires_at` includes a step ID, that step's render output gets an event pill. When it includes a side-branch ID, that side-branch gets one. Step IDs referenced here must exist somewhere in the flow — the validator catches dangling references.

**`fires_at_display`** is an optional override for the right-side label rendered in the audit index (E2). Use it when the event doesn't fire at a single labeled step:

```yaml
- name: recovery.dispute.create
  fires_at: ["03.async"]
  fires_at_display: "async (any time post-03)"
```

`fires_at` still drives where the pill renders (on the `03.async` side-branch). `fires_at_display` only changes the human-readable label in the index.

An event with empty `fires_at` and no `fires_at_display` produces a validator warning — it will appear in the index unanchored to anything, which is usually a mistake.

---

## Color references

Anywhere a color is allowed (fork legs, branch accent, arrow color, terminator color, reroute color) the author writes one of three forms:

| Form | Example | Resolves to |
|---|---|---|
| Hex literal | `"#dc2626"` | Itself |
| Outcome reference | `outcome:success` | The `color` of that outcome entry |
| Actor reference | `actor:manager` | The `color` of that actor entry |

The validator catches references to outcomes/actors that aren't declared in frontmatter.

---

## Nesting rules

Decisions can nest inside branches of other decisions. The reference artifact does this once (outer PASS/FAIL decision → FAIL branch contains a manager-escalation inner decision), and that's roughly the complexity ceiling we want to support.

- **Soft cap: 2 levels.** Outer decision → branch → inner decision → branch → steps. This is the recommended depth and produces readable diagrams at the 960px width budget.
- **Hard cap: 3 levels.** The generator refuses to render anything deeper and the linter throws an error pointing at the offending decision. Authors who hit this need to redesign the flow, not work around the limit.
- **No sub-flow primitive in v1.** Flows that need more depth than this aren't a fit for the format — split them into separate diagrams or rethink the decision structure. We're not shipping linked sub-flows.
- **Inner-container tint does not compound.** An inner branch container uses its own accent color at the same `rgba(<color>, 0.03)` tint as a top-level container — not a darkened or doubled tint. This keeps nested levels visually distinct without making the inner container look "deeper" by being darker.
- **Step IDs cross levels naturally.** Authors write IDs that reflect their own nesting scheme (`9.1.5` for "outer FAIL branch 9, inner sub-branch 1, step 5"). The generator does not enforce a numbering pattern; the linter only enforces uniqueness across the whole doc.

---

## Customization options

### Frontmatter knobs

| Key | Type | Default | Effect |
|---|---|---|---|
| `title` | string | required | H1 in the header block (A1) |
| `kicker` | string | optional | Tracked uppercase line above the title (A1) |
| `description` | string | optional | Lead paragraph under the title (A1) |
| `theme` | enum | `blueprint` | `blueprint` \| `mono-light` \| `mono-dark`. Reserved for future themes; only `blueprint` is implemented today. |
| `direction` | enum | `TB` | `TB` (top-bottom) \| `LR` (left-right). Reserved; only `TB` is implemented today. |
| `max_width` | px | `960` | Width of the centered container. |
| `actors` | object | required | Map of actor key → `{label, color, icon}`. See below. |
| `outcomes` | object | required | Map of outcome key → `{label, color}`. Add a third entry for three-way decisions. |
| `event_log` | object | amber preset | `{color, text, bg}`. Retints all audit-event accents. |

### Actor declarations

Each actor entry produces a legend chip and a chip on every step that references it.

- `label` — string. Uppercase recommended.
- `color` — hex. Chip background; text is forced white.
- `icon` — one of `user`, `server`, `user-cog`, `shield`, `database`, `cog`, `bot`, `tag`.

No cap on number of actors. Legend wraps.

### Outcome declarations

Each outcome entry can cascade into a fork leg, branch container left-border, colored arrow, terminator, and terminal-state card.

- `label` — string shown on the path chip (e.g. `YES · PASS`).
- `color` — hex. Cascades.

### Per-node overrides on a step

| Field | Type | Effect |
|---|---|---|
| `id` | string | Author-supplied. Needed for `fires_at` references and shown in the chip row. |
| `actor` | actor key | Picks the chip in the chip row. |
| `title` | string | Bold body line. |
| `desc` | string | Secondary line in stone-600. |
| `outcome` | outcome key | Promotes the step to a terminal (B2): heavy outcome-colored border + outcome pill. |
| `pill` | string | Extra inline tracked-uppercase pill in the chip row (e.g. `ASYNC · PARALLEL`). |
| `side_branch` | object | Attaches a B3 side-branch with its own dashed elbow. |

### Side-branch fields

| Field | Type | Effect |
|---|---|---|
| `id` | string | Optional. Allows `fires_at: ["<id>"]` to inject event pills on this side branch. |
| `variant` | enum | `async` (default) renders dashed amber + warning icon. `note` reserved for non-async callouts. |
| `actor` | actor key | Chip in the side branch's chip row. |
| `pill` | string | Inline tracked-uppercase pill. |
| `title`, `desc` | string | Body. |
| `trailing_note` | string | Italic gray note alongside the event-pill row. |

### Audit event fields

| Field | Type | Effect |
|---|---|---|
| `name` | string | Event name, rendered in the pill and index. |
| `desc` | string | Optional. Reserved for richer index entries; not rendered today. |
| `fires_at` | string[] | Step or side-branch IDs where this event renders a pill. |
| `fires_at_display` | string | Optional override for the index's right-side label. |

### What is intentionally NOT customizable

These are part of the visual language and fixed across all docs:

- Card border widths and the heavy top-stroke pattern (B1: `3px 1px 1px`, B2: `4px top + 2px outer`, C3: `1px 1px 1px 5px`).
- Fonts (`JetBrains Mono` / `Fira Code` for body, `ui-serif, Georgia` for the H1).
- Edge geometry (vertical line + 12×10 filled triangle).
- Decision-chip shape (hexagonal clip-path).
- Header `border-bottom: 3px solid rgb(12, 10, 9)`.
- Background color (`bg-stone-100`).
- Step-number formatting (author-supplied; not auto-generated).

Relaxing any of these later becomes a new theme entry, not a per-doc knob.
