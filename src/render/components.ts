import type {
  FlowDocT,
  FlowItemT,
  StepT,
  SideBranchT,
  DecisionT,
  ForkT,
  ArrowT,
  TerminatorT,
  RerouteT,
  BranchBlockT,
  ParallelBlockT,
  AuditEventT,
} from "../schema.js";
import { html, raw, style, type RawHtml } from "./html.js";
import { icon, type IconName } from "./icons.js";
import { resolveColor, withAlpha } from "./colors.js";
import type { EventLookup } from "../lookup.js";

// Font stacks. Use single quotes around font names so the resulting CSS sits
// cleanly inside a double-quoted HTML `style="..."` attribute — double quotes
// would terminate the attribute early and the font-family would render empty.
const MONO = `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace`;
const DISPLAY = `ui-serif, 'Georgia', serif`;

// ---------------------------------------------------------------------------
// Render context
//
// Threaded through nested renders so children know their containing context.
// Drives default arrow heights and lets each component access frontmatter
// palettes + the event lookup without re-deriving them.
// ---------------------------------------------------------------------------

export interface RenderCtx {
  doc: FlowDocT;
  events: EventLookup;
  /** Stack of container types; topmost = innermost. */
  containerStack: Array<"root" | "branch" | "parallel-column">;
}

function defaultArrowHeight(ctx: RenderCtx): number {
  const top = ctx.containerStack[ctx.containerStack.length - 1];
  if (top === "parallel-column") return 8;
  if (top === "branch") return 10;
  return 20;
}

function pushed(ctx: RenderCtx, kind: RenderCtx["containerStack"][number]): RenderCtx {
  return { ...ctx, containerStack: [...ctx.containerStack, kind] };
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export function actorChip(actorKey: string, ctx: RenderCtx): RawHtml {
  const a = ctx.doc.frontmatter.actors[actorKey];
  if (!a) return raw("");
  return html`<span
    class="inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.2em] pl-1 pr-1.5 py-0.5 text-white"
    style="${raw(style({ backgroundColor: a.color, fontFamily: MONO }))}"
  >${raw(icon(a.icon as IconName, { size: 11, strokeWidth: 2.5 }))}${a.label}</span>`;
}

export function logPill(eventName: string, ctx: RenderCtx): RawHtml {
  const { color: border, text, bg } = ctx.doc.frontmatter.event_log;
  return html`<span
    class="inline-flex items-center gap-1 text-[9px] tracking-[0.03em] px-1.5 py-0.5"
    style="${raw(
      style({
        fontFamily: MONO,
        backgroundColor: bg,
        color: text,
        border: `1px solid ${border}`,
      }),
    )}"
  >${raw(
    icon("file-text", { size: 9, strokeWidth: 2.5, color: text }),
  )}<span class="font-bold">${eventName}</span></span>`;
}

// ---------------------------------------------------------------------------
// Step (and its terminal variant when `outcome` is set)
// ---------------------------------------------------------------------------

export function renderStep(step: StepT, ctx: RenderCtx): RawHtml {
  const outcomeColor = step.outcome
    ? resolveColor(`outcome:${step.outcome}`, ctx.doc.frontmatter)
    : undefined;
  const stepStyle = step.outcome
    ? style({
        border: `2px solid ${outcomeColor}`,
        borderTopWidth: 4,
      })
    : style({
        borderWidth: "3px 1px 1px",
        borderStyle: "solid",
        borderColor: "#1c1917",
      });

  const events = step.id ? ctx.events.get(step.id) ?? [] : [];

  const sideBranch = step.side_branch
    ? renderSideBranch(step.side_branch, ctx)
    : raw("");

  const inner = html`<div class="px-3 py-2.5">
    <div class="flex items-center gap-2 mb-1.5">
      ${actorChip(step.actor, ctx)}
      ${step.id
        ? html`<span class="text-[9px] tabular-nums tracking-wider text-stone-500" style="${raw(
            style({ fontFamily: MONO }),
          )}">${step.id}</span>`
        : raw("")}
      ${step.pill
        ? html`<span class="text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5 text-white" style="${raw(
            style({
              backgroundColor: ctx.doc.frontmatter.event_log.text,
              fontFamily: MONO,
            }),
          )}">${step.pill}</span>`
        : raw("")}
      ${step.outcome
        ? html`<span class="ml-auto text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5 text-white" style="${raw(
            style({ backgroundColor: outcomeColor!, fontFamily: MONO }),
          )}">${ctx.doc.frontmatter.outcomes[step.outcome].label}</span>`
        : raw("")}
    </div>
    <div class="text-[13px] font-bold text-stone-900 leading-tight" style="${raw(
      style({ fontFamily: MONO }),
    )}">${step.title}</div>
    ${step.desc
      ? html`<div class="text-[11px] mt-1 leading-snug text-stone-600" style="${raw(
          style({ fontFamily: MONO }),
        )}">${step.desc}</div>`
      : raw("")}
    ${events.length > 0
      ? html`<div class="flex flex-wrap gap-1 mt-2 pt-2" style="${raw(
          style({
            borderTop: `1px dashed ${ctx.doc.frontmatter.event_log.color}`,
          }),
        )}">${events.map((e) => logPill(e.name, ctx))}</div>`
      : raw("")}
  </div>`;

  const stepHtml = html`<div class="relative bg-white" style="${raw(stepStyle)}">${inner}</div>`;
  return raw(stepHtml.__raw + sideBranch.__raw);
}

// ---------------------------------------------------------------------------
// Side branch — dashed amber callout attached to a parent step via a dashed
// elbow connector.
// ---------------------------------------------------------------------------

export function renderSideBranch(sb: SideBranchT, ctx: RenderCtx): RawHtml {
  const { color: border, text, bg } = ctx.doc.frontmatter.event_log;
  const events = sb.id ? ctx.events.get(sb.id) ?? [] : [];

  return html`<div class="my-3 ml-6">
    <div class="flex items-stretch">
      <div class="flex flex-col items-center pr-3">
        <svg width="20" height="40" viewBox="0 0 20 40" class="-mt-2">
          <path d="M 10 0 L 10 20 L 20 20" stroke="${text}" stroke-width="2" stroke-dasharray="3 3" fill="none"></path>
        </svg>
      </div>
      <div class="flex-1 bg-white" style="${raw(
        style({ border: `2px dashed ${border}`, backgroundColor: bg }),
      )}">
        <div class="px-3 py-2.5">
          <div class="flex items-center gap-2 mb-1.5">
            ${sb.actor ? actorChip(sb.actor, ctx) : raw("")}
            ${sb.pill
              ? html`<span class="text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5 text-white" style="${raw(
                  style({ backgroundColor: text, fontFamily: MONO }),
                )}">${sb.pill}</span>`
              : raw("")}
            ${sb.variant === "async"
              ? raw(
                  icon("triangle-alert", {
                    size: 12,
                    strokeWidth: 2,
                    color: text,
                    className: "ml-auto",
                  }),
                )
              : raw("")}
          </div>
          <div class="text-[12px] font-bold text-stone-900 leading-tight" style="${raw(
            style({ fontFamily: MONO }),
          )}">${sb.title}</div>
          ${sb.desc
            ? html`<div class="text-[10px] mt-1 leading-snug text-stone-600" style="${raw(
                style({ fontFamily: MONO }),
              )}">${sb.desc}</div>`
            : raw("")}
          ${events.length > 0 || sb.trailing_note
            ? html`<div class="flex flex-wrap gap-1 mt-2 pt-2 items-center" style="${raw(
                style({ borderTop: `1px dashed ${border}` }),
              )}">
                ${events.map((e) => logPill(e.name, ctx))}
                ${sb.trailing_note
                  ? html`<span class="text-[9px] tracking-[0.05em] px-1.5 py-0.5 text-stone-600 italic" style="${raw(
                      style({ fontFamily: MONO }),
                    )}">${sb.trailing_note}</span>`
                  : raw("")}
              </div>`
            : raw("")}
        </div>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Arrow — line + optional label chip + triangle arrowhead.
// ---------------------------------------------------------------------------

export function renderArrow(arrow: ArrowT | null, ctx: RenderCtx): RawHtml {
  const color = arrow?.color
    ? resolveColor(arrow.color, ctx.doc.frontmatter)
    : "#1c1917";
  const height = arrow?.height ?? defaultArrowHeight(ctx);
  const label = arrow?.label;

  return html`<div class="flex flex-col items-center py-1">
    <div style="${raw(style({ width: 2, height, backgroundColor: color }))}"></div>
    ${label
      ? html`<div class="text-[9px] font-bold tracking-[0.2em] px-2 py-0.5 my-1 text-white" style="${raw(
          style({ backgroundColor: color, fontFamily: MONO }),
        )}">${label}</div>
        <div style="${raw(style({ width: 2, height: 6, backgroundColor: color }))}"></div>`
      : raw("")}
    <svg width="12" height="10" viewBox="0 0 12 10">
      <path d="M 0 0 L 12 0 L 6 10 Z" fill="${color}"></path>
    </svg>
  </div>`;
}

// ---------------------------------------------------------------------------
// Decision — hexagonal label chip.
// ---------------------------------------------------------------------------

export function renderDecision(d: DecisionT): RawHtml {
  return html`<div class="flex justify-center py-2">
    <div class="relative text-[11px] tracking-[0.2em] font-bold px-5 py-2 text-white" style="${raw(
      style({
        backgroundColor: "#0c0a09",
        fontFamily: MONO,
        clipPath:
          "polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)",
      }),
    )}">${d.label}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Fork — visual splitter with colored legs.
// ---------------------------------------------------------------------------

export function renderFork(f: ForkT, ctx: RenderCtx): RawHtml {
  const legs = f.legs.map((leg) => ({
    label: leg.label,
    color: resolveColor(leg.color, ctx.doc.frontmatter),
  }));

  const legBodies = legs.map(
    (leg) => html`<div class="flex flex-col items-center">
      <div style="${raw(style({ width: 2, height: 10, backgroundColor: leg.color }))}"></div>
      <div class="text-[9px] font-bold tracking-[0.2em] px-2 py-0.5 my-1 text-white" style="${raw(
        style({ backgroundColor: leg.color, fontFamily: MONO }),
      )}">${leg.label}</div>
      <div style="${raw(style({ width: 2, height: 8, backgroundColor: leg.color }))}"></div>
      <svg width="12" height="10" viewBox="0 0 12 10">
        <path d="M 0 0 L 12 0 L 6 10 Z" fill="${leg.color}"></path>
      </svg>
    </div>`,
  );

  const gridCols =
    legs.length === 2 ? "grid-cols-2" : legs.length === 3 ? "grid-cols-3" : "grid-cols-4";

  const topBars = legs.map((_, i) => {
    const isLeft = i === 0;
    const isRight = i === legs.length - 1;
    const left = isLeft ? "50%" : "0";
    const right = isRight ? "50%" : "0";
    return html`<div class="relative">
      <div class="absolute top-0" style="${raw(
        style({ left, right, height: 2, backgroundColor: "#1c1917" }),
      )}"></div>
    </div>`;
  });

  return html`<div class="flex flex-col items-stretch">
    <div class="flex justify-center">
      <div style="${raw(style({ width: 2, height: 14, backgroundColor: "#1c1917" }))}"></div>
    </div>
    <div class="grid ${raw(gridCols)} relative">${topBars}</div>
    <div class="grid ${raw(gridCols)}">${legBodies}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Terminator — small circle marking a path's end.
// ---------------------------------------------------------------------------

export function renderTerminator(t: TerminatorT, ctx: RenderCtx): RawHtml {
  const color = resolveColor(t.color, ctx.doc.frontmatter);
  return html`<div class="flex justify-center py-1">
    <div class="w-3 h-3 rounded-full border-2" style="${raw(
      style({ borderColor: color, backgroundColor: "white" }),
    )}"></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Reroute — dashed red bridge between vertically-stacked branches.
// ---------------------------------------------------------------------------

export function renderReroute(r: RerouteT, ctx: RenderCtx): RawHtml {
  const color = resolveColor(r.color, ctx.doc.frontmatter);
  return html`<div class="my-6">
    <div class="relative bg-white flex items-center gap-3 px-4 py-3" style="${raw(
      style({ border: `2px dashed ${color}` }),
    )}">
      <div class="flex items-center justify-center w-8 h-8" style="${raw(
        style({ backgroundColor: color }),
      )}">
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M 2 2 L 2 10 L 10 10 M 7 7 L 10 10 L 7 13" stroke="white" stroke-width="2" fill="none"></path>
        </svg>
      </div>
      <div class="flex-1">
        <div class="text-[10px] font-bold tracking-[0.2em]" style="${raw(
          style({ color, fontFamily: MONO }),
        )}">${r.label}</div>
        ${r.description
          ? html`<div class="text-[11px] text-stone-600 mt-0.5" style="${raw(
              style({ fontFamily: MONO }),
            )}">${r.description}</div>`
          : raw("")}
      </div>
      <svg width="14" height="18" viewBox="0 0 14 18">
        <path d="M 7 0 L 7 14 M 0 10 L 7 18 L 14 10" stroke="${color}" stroke-width="2" fill="none"></path>
      </svg>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Branch — colored-left-border container with header strip.
// ---------------------------------------------------------------------------

export function renderBranch(b: BranchBlockT, ctx: RenderCtx): RawHtml {
  const accent = resolveColor(b.accent, ctx.doc.frontmatter);
  const innerCtx = pushed(ctx, "branch");

  const containerStyle = style({
    borderLeft: `5px solid ${accent}`,
    border: `1px solid ${withAlpha(accent, 0.25)}`,
    borderLeftWidth: 5,
  });

  const headerStyle = style({
    borderColor: withAlpha(accent, 0.19),
    backgroundColor: withAlpha(accent, 0.03),
  });

  return html`<div class="relative bg-white" style="${raw(containerStyle)}">
    <div class="flex items-baseline gap-3 px-4 py-2 border-b" style="${raw(headerStyle)}">
      <span class="text-[9px] font-bold tracking-[0.25em] px-1.5 py-0.5 text-white" style="${raw(
        style({ backgroundColor: accent, fontFamily: MONO }),
      )}">${b.id}</span>
      <span class="text-[11px] font-bold tracking-[0.1em] uppercase" style="${raw(
        style({ color: accent, fontFamily: MONO }),
      )}">${b.title}</span>
      ${b.subtitle
        ? html`<span class="text-[10px] text-stone-500 ml-auto" style="${raw(
            style({ fontFamily: MONO }),
          )}">${b.subtitle}</span>`
        : raw("")}
    </div>
    <div class="p-4 space-y-2">${renderFlow(b.children, innerCtx)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Parallel — multi-column container. When `label` is non-empty, renders the
// "tab"-style label peeking above the dashed border.
// ---------------------------------------------------------------------------

export function renderParallel(p: ParallelBlockT, ctx: RenderCtx): RawHtml {
  const colsCount = p.columns.length;
  const grid =
    colsCount === 2
      ? "grid-cols-1 md:grid-cols-2"
      : colsCount === 3
        ? "grid-cols-1 md:grid-cols-3"
        : "grid-cols-1 md:grid-cols-4";

  const innerCtx = pushed(ctx, "parallel-column");

  const cols = p.columns.map(
    (col) => html`<div>
      ${col.label
        ? html`<div class="text-[9px] font-bold tracking-[0.25em] text-stone-500 mb-2" style="${raw(
            style({ fontFamily: MONO }),
          )}">${col.label}</div>`
        : raw("")}
      <div class="space-y-1.5">${renderFlow(col.children, innerCtx)}</div>
    </div>`,
  );

  if (!p.label) {
    return html`<div class="grid ${raw(grid)} gap-4 mt-2">${cols}</div>`;
  }

  return html`<div class="relative bg-white" style="${raw(
    style({ border: "2px dashed #1c1917" }),
  )}">
    <div class="absolute -top-3 left-3 bg-stone-900 text-white px-2 py-1">
      <span class="text-[9px] font-bold tracking-[0.25em]" style="${raw(
        style({ fontFamily: MONO }),
      )}">${p.label}</span>
    </div>
    <div class="grid ${raw(grid)} gap-4 p-4 pt-5">${cols}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// renderFlow — walks an array of FlowItems, auto-inserting default arrows
// between two consecutive `step` items.
// ---------------------------------------------------------------------------

export function renderFlow(items: FlowItemT[], ctx: RenderCtx): RawHtml {
  const parts: RawHtml[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const next = items[i + 1];

    parts.push(renderItem(item, ctx));

    // Implicit arrow between two consecutive step items.
    if (item.type === "step" && next && next.type === "step") {
      parts.push(renderArrow(null, ctx));
    }
  }
  return raw(parts.map((p) => p.__raw).join("\n"));
}

function renderItem(item: FlowItemT, ctx: RenderCtx): RawHtml {
  switch (item.type) {
    case "step":
      return renderStep(item, ctx);
    case "arrow":
      return renderArrow(item, ctx);
    case "decision":
      return renderDecision(item);
    case "fork":
      return renderFork(item, ctx);
    case "terminator":
      return renderTerminator(item, ctx);
    case "reroute":
      return renderReroute(item, ctx);
    case "branch":
      return renderBranch(item, ctx);
    case "parallel":
      return renderParallel(item, ctx);
  }
}

// ---------------------------------------------------------------------------
// Document chrome
// ---------------------------------------------------------------------------

export function renderHeader(doc: FlowDocT): RawHtml {
  const fm = doc.frontmatter;
  return html`<div class="mb-8 pb-4" style="${raw(style({ borderBottom: "3px solid #0c0a09" }))}">
    <div class="flex items-end justify-between gap-4 flex-wrap">
      <div>
        ${fm.kicker
          ? html`<div class="text-[10px] tracking-[0.3em] text-stone-500 mb-2" style="${raw(
              style({ fontFamily: MONO }),
            )}">${fm.kicker}</div>`
          : raw("")}
        <h1 class="text-4xl text-stone-900 font-bold tracking-tight" style="${raw(
          style({ fontFamily: DISPLAY }),
        )}">${fm.title}</h1>
        ${fm.description
          ? html`<p class="text-[11px] text-stone-600 mt-2 max-w-3xl leading-relaxed" style="${raw(
              style({ fontFamily: MONO }),
            )}">${fm.description}</p>`
          : raw("")}
      </div>
      ${renderLegend(doc)}
    </div>
  </div>`;
}

function renderLegend(doc: FlowDocT): RawHtml {
  const fm = doc.frontmatter;
  const ctx: RenderCtx = {
    doc,
    events: new Map(),
    containerStack: ["root"],
  };

  const actorChips = Object.keys(fm.actors).map((k) => actorChip(k, ctx));

  const outcomeChips = Object.values(fm.outcomes).map(
    (o) => html`<span class="text-[9px] font-bold tracking-[0.2em] px-1.5 py-0.5 text-white" style="${raw(
      style({ backgroundColor: o.color, fontFamily: MONO }),
    )}">${o.label}</span>`,
  );

  return html`<div class="bg-white border-2 border-stone-900 p-3 space-y-2 min-w-[260px]">
    <div class="text-[9px] font-bold tracking-[0.25em] text-stone-500 pb-1 border-b border-stone-300" style="${raw(
      style({ fontFamily: MONO }),
    )}">LEGEND</div>
    <div class="flex items-center gap-2 flex-wrap">${actorChips}</div>
    <div class="flex items-center gap-2 pt-1 border-t border-stone-200">${outcomeChips}</div>
    <div class="flex items-center gap-2 pt-1 border-t border-stone-200">
      ${logPill("event.name.here", ctx)}
      <span class="text-[9px] text-stone-500" style="${raw(
        style({ fontFamily: MONO }),
      )}">audit log</span>
    </div>
  </div>`;
}

export function renderTerminalStates(doc: FlowDocT): RawHtml {
  if (doc.terminal_states.length === 0) return raw("");
  const cards = doc.terminal_states.map((tg) => {
    const color = doc.frontmatter.outcomes[tg.outcome]?.color ?? "#1c1917";
    const label = doc.frontmatter.outcomes[tg.outcome]?.label ?? tg.outcome;
    return html`<div class="bg-white p-3" style="${raw(
      style({
        borderLeft: `5px solid ${color}`,
        border: `1px solid ${withAlpha(color, 0.25)}`,
        borderLeftWidth: 5,
      }),
    )}">
      <div class="text-[9px] font-bold tracking-[0.25em] mb-1" style="${raw(
        style({ color, fontFamily: MONO }),
      )}">${label} · ${tg.count ?? tg.items.length} TERMINAL STATES</div>
      <div class="text-[11px] text-stone-700" style="${raw(
        style({ fontFamily: MONO }),
      )}">${tg.items.join(" · ")}</div>
    </div>`;
  });

  return html`<div class="mt-10 grid grid-cols-1 md:grid-cols-2 gap-3">${cards}</div>`;
}

export function renderAuditIndex(doc: FlowDocT): RawHtml {
  if (doc.audit_events.length === 0) return raw("");
  const { color: border, text } = doc.frontmatter.event_log;
  const ctx: RenderCtx = { doc, events: new Map(), containerStack: ["root"] };

  const entries = doc.audit_events.map((ev: AuditEventT) => {
    const where = ev.fires_at_display ?? (ev.fires_at ?? []).join(" · ");
    return html`<div class="flex items-center justify-between gap-2 text-[10px]" style="${raw(
      style({ fontFamily: MONO }),
    )}">
      ${logPill(ev.name, ctx)}
      <span class="text-stone-500 tabular-nums shrink-0">${where}</span>
    </div>`;
  });

  return html`<div class="mt-6 bg-white p-4" style="${raw(
    style({ border: `2px solid ${border}` }),
  )}">
    <div class="text-[9px] font-bold tracking-[0.25em] mb-3 pb-2 flex items-center gap-2" style="${raw(
      style({
        color: text,
        fontFamily: MONO,
        borderBottom: `1px dashed ${border}`,
      }),
    )}">${raw(
      icon("file-text", { size: 11, strokeWidth: 2.5, color: text }),
    )}AUDIT EVENT INDEX · ${doc.audit_events.length} EVENTS</div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">${entries}</div>
  </div>`;
}

export function renderFootnotes(doc: FlowDocT): RawHtml {
  if (doc.footnotes.length === 0) return raw("");
  const lines = doc.footnotes.map(
    (f) =>
      html`<p><span class="font-bold text-stone-800">${f.label} ·</span> ${f.body}</p>`,
  );
  return html`<div class="mt-8 pt-4 border-t-2 border-stone-900 text-[10px] text-stone-500 leading-relaxed space-y-1.5" style="${raw(
    style({ fontFamily: MONO }),
  )}">${lines}</div>`;
}
