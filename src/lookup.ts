import type { FlowDocT, FlowItemT, AuditEventT } from "./schema.js";

// ---------------------------------------------------------------------------
// Lookup helpers
//
// Two derivations the renderer needs at render time:
//
//   1. eventsFor(id) — given a step or side-branch ID, the list of audit events
//      that fire there. Built by inverting the audit_events `fires_at` arrays.
//
//   2. collectIds(doc) — every step and side-branch ID declared in the flow.
//      Used by the validator to catch dangling `fires_at` references.
//
// Both are pure functions over a parsed FlowDoc.
// ---------------------------------------------------------------------------

export type EventLookup = Map<string, AuditEventT[]>;

export function buildEventLookup(doc: FlowDocT): EventLookup {
  const map: EventLookup = new Map();
  for (const ev of doc.audit_events) {
    for (const id of ev.fires_at ?? []) {
      const list = map.get(id) ?? [];
      list.push(ev);
      map.set(id, list);
    }
  }
  return map;
}

export function eventsFor(lookup: EventLookup, id: string | undefined): AuditEventT[] {
  if (!id) return [];
  return lookup.get(id) ?? [];
}

export function collectIds(doc: FlowDocT): Set<string> {
  const ids = new Set<string>();
  function walk(items: FlowItemT[]) {
    for (const item of items) {
      if (item.type === "step") {
        if (item.id) ids.add(item.id);
        if (item.side_branch?.id) ids.add(item.side_branch.id);
      } else if (item.type === "branch") {
        walk(item.children);
      } else if (item.type === "parallel") {
        for (const col of item.columns) walk(col.children);
      }
    }
  }
  walk(doc.flow);
  return ids;
}
