import { z } from "zod";

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u, "expected hex color like #1c1917");

const IconName = z.enum([
  "user",
  "server",
  "user-cog",
  "shield",
  "database",
  "cog",
  "bot",
  "tag",
]);

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

const Actor = z.object({
  label: z.string(),
  color: HexColor,
  icon: IconName,
});

const Outcome = z.object({
  label: z.string(),
  color: HexColor,
});

const EventLog = z.object({
  color: HexColor.default("#b45309"),
  text: HexColor.default("#92400e"),
  bg: HexColor.default("#fffbeb"),
});

export const Frontmatter = z.object({
  title: z.string(),
  kicker: z.string().optional(),
  description: z.string().optional(),
  theme: z.enum(["blueprint", "mono-light", "mono-dark"]).default("blueprint"),
  direction: z.enum(["TB", "LR"]).default("TB"),
  max_width: z.number().int().positive().default(960),
  actors: z.record(z.string(), Actor),
  outcomes: z.record(z.string(), Outcome),
  event_log: EventLog.default({
    color: "#b45309",
    text: "#92400e",
    bg: "#fffbeb",
  }),
});

// ---------------------------------------------------------------------------
// Color references
//
// Inside the body, anywhere a color is allowed the author can write:
//   - a hex string (#dc2626)
//   - an outcome key (outcome:success)
//   - an actor key (actor:manager)
//
// The renderer resolves these against the frontmatter palettes.
// The schema accepts the string form and validation of references is done in
// validate.ts after the doc parses.
// ---------------------------------------------------------------------------

const ColorRef = z.string(); // free-form here; validator checks the form

// ---------------------------------------------------------------------------
// Flow items
//
// Discriminated union on `type`. Recursive nesting is handled with z.lazy.
// ---------------------------------------------------------------------------

const SideBranch = z.object({
  type: z.literal("side_branch").optional(),
  id: z.string().optional(), // referenceable from AuditEvent.fires_at
  variant: z.enum(["async", "note"]).default("async"),
  actor: z.string().optional(),
  pill: z.string().optional(),
  title: z.string(),
  desc: z.string().optional(),
  trailing_note: z.string().optional(),
});
export type SideBranchT = z.infer<typeof SideBranch>;

const Step = z.object({
  type: z.literal("step"),
  id: z.string().optional(),
  actor: z.string(),
  title: z.string(),
  desc: z.string().optional(),
  outcome: z.string().optional(), // outcome key — promotes this to a terminal step
  pill: z.string().optional(),
  side_branch: SideBranch.optional(),
});
export type StepT = z.infer<typeof Step>;

const Decision = z.object({
  type: z.literal("decision"),
  label: z.string(),
});
export type DecisionT = z.infer<typeof Decision>;

const Fork = z.object({
  type: z.literal("fork"),
  legs: z
    .array(
      z.object({
        label: z.string(),
        color: ColorRef,
      }),
    )
    .min(2)
    .max(4),
});
export type ForkT = z.infer<typeof Fork>;

const Arrow = z.object({
  type: z.literal("arrow"),
  label: z.string().optional(),
  color: ColorRef.optional(),
  height: z.number().int().positive().optional(),
});
export type ArrowT = z.infer<typeof Arrow>;

const Terminator = z.object({
  type: z.literal("terminator"),
  color: ColorRef,
});
export type TerminatorT = z.infer<typeof Terminator>;

const Reroute = z.object({
  type: z.literal("reroute"),
  label: z.string(),
  description: z.string().optional(),
  color: ColorRef.default("outcome:blocked"),
});
export type RerouteT = z.infer<typeof Reroute>;

// Recursive types — BranchBlock and ParallelBlock contain FlowItem[]
type _FlowItem =
  | StepT
  | DecisionT
  | ForkT
  | ArrowT
  | TerminatorT
  | RerouteT
  | BranchBlockT
  | ParallelBlockT;

export interface BranchBlockT {
  type: "branch";
  id: string;
  title: string;
  subtitle?: string;
  accent: string;
  layout?: "stack" | "side-by-side";
  children: _FlowItem[];
}

export interface ParallelBlockT {
  type: "parallel";
  label: string;
  columns: Array<{
    label?: string;
    children: _FlowItem[];
  }>;
}

const BranchBlock: z.ZodType<BranchBlockT> = z.lazy(() =>
  z.object({
    type: z.literal("branch"),
    id: z.string(),
    title: z.string(),
    subtitle: z.string().optional(),
    accent: ColorRef,
    layout: z.enum(["stack", "side-by-side"]).optional(),
    children: z.array(FlowItem),
  }),
);

const ParallelBlock: z.ZodType<ParallelBlockT> = z.lazy(() =>
  z.object({
    type: z.literal("parallel"),
    label: z.string(),
    columns: z
      .array(
        z.object({
          label: z.string().optional(),
          children: z.array(FlowItem),
        }),
      )
      .min(2)
      .max(4),
  }),
);

// z.discriminatedUnion can't accept ZodLazy entries (BranchBlock/ParallelBlock
// recurse through FlowItem). Use a plain union; runtime discrimination still
// happens via the `type` literal on each branch.
//
// The cast to ZodType<_FlowItem> sidesteps a known limitation: Zod's inferred
// *input* type for a unioned schema includes optional fields that the *output*
// type has defaulted in. Our hand-written interface uses the output shape so
// the recursive children type-check cleanly. The runtime is sound — Zod still
// applies the defaults at parse time.
export const FlowItem = z.lazy(() =>
  z.union([
    Step,
    Decision,
    Fork,
    Arrow,
    Terminator,
    Reroute,
    BranchBlock,
    ParallelBlock,
  ]),
) as unknown as z.ZodType<_FlowItem>;
export type FlowItemT = _FlowItem;

// ---------------------------------------------------------------------------
// Trailing sections
// ---------------------------------------------------------------------------

const TerminalGroup = z.object({
  outcome: z.string(),
  count: z.number().int().positive().optional(),
  items: z.array(z.string()).min(1),
});
export type TerminalGroupT = z.infer<typeof TerminalGroup>;

const AuditEvent = z.object({
  name: z.string(),
  desc: z.string().optional(),
  // Step IDs (or side-branch IDs) where this event fires. The renderer reverse-maps
  // this so each step/side-branch knows which event pills to display. This is the
  // single source of truth — events are NOT declared inline on steps.
  fires_at: z.array(z.string()).default([]),
  // Optional override for how `fires_at` is rendered in the audit-event index.
  // Useful for non-step-keyed events, e.g. "async (any time post-03)".
  fires_at_display: z.string().optional(),
});
export type AuditEventT = z.infer<typeof AuditEvent>;

const Footnote = z.object({
  label: z.string(),
  body: z.string(),
});
export type FootnoteT = z.infer<typeof Footnote>;

// ---------------------------------------------------------------------------
// FlowDoc — the full parsed document
// ---------------------------------------------------------------------------

export const FlowDoc = z.object({
  frontmatter: Frontmatter,
  flow: z.array(FlowItem),
  terminal_states: z.array(TerminalGroup).default([]),
  audit_events: z.array(AuditEvent).default([]),
  footnotes: z.array(Footnote).default([]),
});

export type FlowDocT = z.infer<typeof FlowDoc>;
export type FrontmatterT = z.infer<typeof Frontmatter>;
