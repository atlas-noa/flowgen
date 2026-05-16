import type { FlowDocT, FlowItemT } from "./schema.js";
import { collectIds } from "./lookup.js";

// ---------------------------------------------------------------------------
// Post-parse validation
//
// The Zod schema enforces shape. This pass enforces *semantic* rules that
// depend on relationships between parts of the doc:
//
//   - color references (outcome:X, actor:X) must resolve to a declared key
//   - audit events used at steps must appear in the audit_events index
//     (warning, not error — useful for early authoring)
//   - decision nesting depth must not exceed the hard cap (3)
//   - branch outcome accents that refer to outcome:X must resolve
//   - step IDs are unique across the whole doc
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export const NESTING_SOFT_CAP = 2;
export const NESTING_HARD_CAP = 3;

export function validate(doc: FlowDocT): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const actorKeys = new Set(Object.keys(doc.frontmatter.actors));
  const outcomeKeys = new Set(Object.keys(doc.frontmatter.outcomes));
  const knownIds = collectIds(doc);
  const seenStepIds = new Map<string, string>(); // id -> path

  function resolveColor(ref: string, path: string) {
    if (ref.startsWith("#")) return; // hex literal; Zod already validated shape
    if (ref.startsWith("outcome:")) {
      const key = ref.slice("outcome:".length);
      if (!outcomeKeys.has(key)) {
        issues.push({
          severity: "error",
          path,
          message: `unknown outcome '${key}' — declare it in frontmatter.outcomes`,
        });
      }
      return;
    }
    if (ref.startsWith("actor:")) {
      const key = ref.slice("actor:".length);
      if (!actorKeys.has(key)) {
        issues.push({
          severity: "error",
          path,
          message: `unknown actor '${key}' — declare it in frontmatter.actors`,
        });
      }
      return;
    }
    issues.push({
      severity: "error",
      path,
      message: `color must be a hex literal, 'outcome:<key>', or 'actor:<key>' (got '${ref}')`,
    });
  }

  function walk(items: FlowItemT[], path: string, decisionDepth: number) {
    items.forEach((item, idx) => {
      const here = `${path}[${idx}]`;
      switch (item.type) {
        case "step": {
          if (!actorKeys.has(item.actor)) {
            issues.push({
              severity: "error",
              path: `${here}.actor`,
              message: `unknown actor '${item.actor}'`,
            });
          }
          if (item.outcome && !outcomeKeys.has(item.outcome)) {
            issues.push({
              severity: "error",
              path: `${here}.outcome`,
              message: `unknown outcome '${item.outcome}'`,
            });
          }
          if (item.id) {
            const prior = seenStepIds.get(item.id);
            if (prior) {
              issues.push({
                severity: "error",
                path: `${here}.id`,
                message: `duplicate step id '${item.id}' (also at ${prior})`,
              });
            }
            seenStepIds.set(item.id, here);
          }
          if (item.side_branch) {
            if (
              item.side_branch.actor &&
              !actorKeys.has(item.side_branch.actor)
            ) {
              issues.push({
                severity: "error",
                path: `${here}.side_branch.actor`,
                message: `unknown actor '${item.side_branch.actor}'`,
              });
            }
            if (item.side_branch.id) {
              const prior = seenStepIds.get(item.side_branch.id);
              if (prior) {
                issues.push({
                  severity: "error",
                  path: `${here}.side_branch.id`,
                  message: `duplicate id '${item.side_branch.id}' (also at ${prior})`,
                });
              }
              seenStepIds.set(item.side_branch.id, `${here}.side_branch`);
            }
          }
          break;
        }
        case "decision": {
          // Decisions in series alone don't nest; depth tracks decisions that
          // appear *inside* a branch container.
          break;
        }
        case "fork": {
          item.legs.forEach((leg, j) =>
            resolveColor(leg.color, `${here}.legs[${j}].color`),
          );
          break;
        }
        case "arrow": {
          if (item.color) resolveColor(item.color, `${here}.color`);
          break;
        }
        case "terminator": {
          resolveColor(item.color, `${here}.color`);
          break;
        }
        case "reroute": {
          resolveColor(item.color, `${here}.color`);
          break;
        }
        case "branch": {
          resolveColor(item.accent, `${here}.accent`);
          const childDepth = decisionDepth + (containsDecision(item.children) ? 1 : 0);
          if (childDepth > NESTING_HARD_CAP) {
            issues.push({
              severity: "error",
              path: here,
              message: `decision nesting depth ${childDepth} exceeds hard cap of ${NESTING_HARD_CAP}`,
            });
          } else if (childDepth > NESTING_SOFT_CAP) {
            issues.push({
              severity: "warning",
              path: here,
              message: `decision nesting depth ${childDepth} exceeds soft cap of ${NESTING_SOFT_CAP} — consider redesigning`,
            });
          }
          walk(item.children, `${here}.children`, childDepth);
          break;
        }
        case "parallel": {
          item.columns.forEach((col, j) =>
            walk(col.children, `${here}.columns[${j}].children`, decisionDepth),
          );
          break;
        }
      }
    });
  }

  function containsDecision(items: FlowItemT[]): boolean {
    return items.some(
      (i) =>
        i.type === "decision" ||
        (i.type === "branch" && containsDecision(i.children)) ||
        (i.type === "parallel" &&
          i.columns.some((c) => containsDecision(c.children))),
    );
  }

  // Validate terminal_states references
  doc.terminal_states.forEach((tg, i) => {
    if (!outcomeKeys.has(tg.outcome)) {
      issues.push({
        severity: "error",
        path: `terminal_states[${i}].outcome`,
        message: `unknown outcome '${tg.outcome}'`,
      });
    }
  });

  walk(doc.flow, "flow", 0);

  // Validate audit_events references — every fires_at must resolve to a
  // declared step or side-branch ID. Authors who need a non-ID display label
  // (e.g. "async post-03") use fires_at_display instead of inventing IDs.
  doc.audit_events.forEach((ev, i) => {
    (ev.fires_at ?? []).forEach((id, j) => {
      if (!knownIds.has(id)) {
        issues.push({
          severity: "error",
          path: `audit_events[${i}].fires_at[${j}]`,
          message: `event '${ev.name}' fires_at unknown id '${id}' — declare an id on a step or side_branch, or use fires_at_display for non-ID labels`,
        });
      }
    });
    if ((ev.fires_at ?? []).length === 0 && !ev.fires_at_display) {
      issues.push({
        severity: "warning",
        path: `audit_events[${i}]`,
        message: `event '${ev.name}' has empty fires_at and no fires_at_display — it won't be associated with any step`,
      });
    }
  });

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}
