import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { validate, hasErrors } from "../src/validate.js";
import { buildEventLookup, eventsFor, collectIds } from "../src/lookup.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "fixtures/recovery-flow.md");
const source = readFileSync(fixturePath, "utf-8");

describe("parser — recovery-flow fixture", () => {
  const doc = parse(source);

  it("loads frontmatter", () => {
    expect(doc.frontmatter.title).toBe("Account Recovery Flow");
    expect(doc.frontmatter.kicker).toContain("self-service device recovery");
    expect(doc.frontmatter.theme).toBe("blueprint");
    expect(doc.frontmatter.direction).toBe("TB");
    expect(doc.frontmatter.max_width).toBe(960);
  });

  it("loads three actors", () => {
    expect(Object.keys(doc.frontmatter.actors).sort()).toEqual([
      "backend",
      "manager",
      "user",
    ]);
    expect(doc.frontmatter.actors.user.color).toBe("#1e3a8a");
    expect(doc.frontmatter.actors.backend.icon).toBe("server");
    expect(doc.frontmatter.actors.manager.icon).toBe("user-cog");
  });

  it("loads two outcomes", () => {
    expect(Object.keys(doc.frontmatter.outcomes).sort()).toEqual([
      "blocked",
      "success",
    ]);
    expect(doc.frontmatter.outcomes.success.label).toBe("PASS");
    expect(doc.frontmatter.outcomes.blocked.color).toBe("#dc2626");
  });

  it("linear preamble is step→step→step with no explicit arrows between", () => {
    // Step 01 and Step 02 sit next to each other in the flow — the parser
    // does NOT auto-insert arrows; the renderer emits defaults between
    // consecutive step items.
    const head = doc.flow.slice(0, 3);
    expect(head[0]).toMatchObject({ type: "step", id: "01", actor: "user" });
    expect(head[1]).toMatchObject({ type: "step", id: "02" });
    expect(head[2]).toMatchObject({ type: "step", id: "03" });
  });

  it("step 03 carries the async dispute side branch with an id", () => {
    const step03 = doc.flow.find(
      (i) => i.type === "step" && (i as any).id === "03",
    ) as any;
    expect(step03.side_branch).toBeDefined();
    expect(step03.side_branch.id).toBe("03.async");
    expect(step03.side_branch.variant).toBe("async");
    expect(step03.side_branch.actor).toBe("backend");
  });

  it("explicit labeled and colored arrows remain in the flow", () => {
    const arrows = doc.flow.filter((i) => i.type === "arrow") as any[];
    const labels = arrows.map((a) => a.label).filter(Boolean);
    expect(labels).toContain("ENTER STEPS 04 + 05");
    expect(labels).toContain("CHALLENGE READY");
    // the colored arrow before branch 08 is explicit because it's colored
    const colored = arrows.find((a) => a.color === "outcome:success");
    expect(colored).toBeDefined();
  });

  it("steps no longer carry inline events", () => {
    // After the events refactor, no step has an `events` field — events live
    // only in ## Audit Events with fires_at.
    function walk(items: any[]): any[] {
      const out: any[] = [];
      for (const item of items) {
        if (item.type === "step") out.push(item);
        if (item.type === "branch") out.push(...walk(item.children));
        if (item.type === "parallel") {
          for (const col of item.columns) out.push(...walk(col.children));
        }
      }
      return out;
    }
    const steps = walk(doc.flow);
    expect(steps.length).toBeGreaterThan(10);
    for (const s of steps) {
      expect("events" in s).toBe(false);
    }
  });

  it("parses the parallel STEPS 04 + 05 block", () => {
    const parallel = doc.flow.find((i) => i.type === "parallel");
    expect(parallel).toBeDefined();
    expect((parallel as any).label).toBe("STEPS 04 + 05 · PARALLEL");
    expect((parallel as any).columns).toHaveLength(2);
    const col0Steps = (parallel as any).columns[0].children.filter(
      (c: any) => c.type === "step",
    );
    const col1Steps = (parallel as any).columns[1].children.filter(
      (c: any) => c.type === "step",
    );
    expect(col0Steps).toHaveLength(1);
    expect(col1Steps).toHaveLength(6);
  });

  it("parses the PASSES THRESHOLD decision and its fork", () => {
    const decisionIdx = doc.flow.findIndex(
      (i) => i.type === "decision" && (i as any).label === "PASSES THRESHOLD?",
    );
    expect(decisionIdx).toBeGreaterThan(0);
    const fork = doc.flow[decisionIdx + 1];
    expect(fork.type).toBe("fork");
    expect((fork as any).legs).toHaveLength(2);
    expect((fork as any).legs[0].color).toBe("outcome:success");
  });

  it("parses the Auto-approved branch with terminator", () => {
    const branch = doc.flow.find(
      (i) => i.type === "branch" && (i as any).id === "08",
    );
    expect(branch).toBeDefined();
    expect((branch as any).accent).toBe("outcome:success");
    const lastTwo = (branch as any).children.slice(-2);
    expect(lastTwo[0].type).toBe("step");
    expect(lastTwo[0].outcome).toBe("success");
    expect(lastTwo[1].type).toBe("terminator");
  });

  it("parses the reroute arrow", () => {
    const reroute = doc.flow.find((i) => i.type === "reroute");
    expect(reroute).toBeDefined();
    expect((reroute as any).label).toBe("DID NOT PASS THRESHOLD");
    expect((reroute as any).color).toBe("outcome:blocked");
  });

  it("parses the deeply nested Below-threshold branch (3 levels)", () => {
    const branch09 = doc.flow.find(
      (i) => i.type === "branch" && (i as any).id === "09",
    ) as any;
    expect(branch09).toBeDefined();

    const parallel = branch09.children.find((c: any) => c.type === "parallel");
    expect(parallel).toBeDefined();

    const b91 = parallel.columns[0].children[0];
    expect(b91.id).toBe("9.1");

    const innerDecision = b91.children.find((c: any) => c.type === "decision");
    expect(innerDecision.label).toBe("APPROVE?");

    const b92 = parallel.columns[1].children[0];
    expect(b92.id).toBe("9.2");
    expect(b92.accent).toBe("#57534e");
  });

  it("parses Terminal States, Audit Events, and Footnotes", () => {
    expect(doc.terminal_states).toHaveLength(2);
    expect(doc.terminal_states[0].outcome).toBe("success");
    expect(doc.terminal_states[0].items).toHaveLength(2);

    expect(doc.audit_events).toHaveLength(11);
    const completeEvent = doc.audit_events.find(
      (e) => e.name === "recovery.complete",
    );
    expect(completeEvent?.fires_at).toContain("8.3");
    expect(completeEvent?.fires_at).toContain("9.2.1");

    const dispute = doc.audit_events.find(
      (e) => e.name === "recovery.dispute.create",
    );
    expect(dispute?.fires_at).toEqual(["03.async"]);
    expect(dispute?.fires_at_display).toBe("async (any time post-03)");

    expect(doc.footnotes).toHaveLength(3);
    expect(doc.footnotes[0].label).toBe("DEMO SCOPE LIMITATIONS");
  });

  it("event lookup associates events with the right step IDs", () => {
    const lookup = buildEventLookup(doc);
    expect(eventsFor(lookup, "03").map((e) => e.name)).toEqual([
      "recovery.request",
    ]);
    expect(eventsFor(lookup, "9.1.3").map((e) => e.name).sort()).toEqual([
      "credential.core_app.enroll",
      "recovery.peer.verify",
    ]);
    expect(eventsFor(lookup, "03.async").map((e) => e.name)).toEqual([
      "recovery.dispute.create",
    ]);
    expect(eventsFor(lookup, "nonexistent")).toEqual([]);
  });

  it("collectIds returns all step and side-branch IDs", () => {
    const ids = collectIds(doc);
    expect(ids.has("01")).toBe(true);
    expect(ids.has("9.1.6")).toBe(true);
    expect(ids.has("03.async")).toBe(true); // side branch id
    expect(ids.has("nonexistent")).toBe(false);
  });

  it("validates with no errors and no warnings", () => {
    const issues = validate(doc);
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(hasErrors(issues)).toBe(false);
  });
});

describe("parser — fenced and unfenced section bodies", () => {
  const head = `---
title: Test
actors:
  user: { label: USER, color: "#000000", icon: user }
outcomes:
  pass: { label: PASS, color: "#00ff00" }
---
`;

  const unfencedFlow = `${head}
## Flow

- type: step
  id: "1"
  actor: user
  title: hello
`;

  const fencedFlow = `${head}
## Flow

\`\`\`yaml
- type: step
  id: "1"
  actor: user
  title: hello
\`\`\`
`;

  it("parses YAML directly under a header (no fences required)", () => {
    const doc = parse(unfencedFlow);
    expect(doc.flow).toHaveLength(1);
    expect((doc.flow[0] as any).id).toBe("1");
  });

  it("still parses a ```yaml fenced block when one is present (back-compat)", () => {
    const doc = parse(fencedFlow);
    expect(doc.flow).toHaveLength(1);
    expect((doc.flow[0] as any).id).toBe("1");
  });
});

describe("parser — error paths", () => {
  it("flags unknown actor references", () => {
    const src = `---
title: Test
actors:
  user: { label: USER, color: "#000000", icon: user }
outcomes:
  pass: { label: PASS, color: "#00ff00" }
---

## Flow

\`\`\`yaml
- type: step
  id: "1"
  actor: nonexistent
  title: oops
\`\`\`
`;
    const doc = parse(src);
    const issues = validate(doc);
    const error = issues.find(
      (i) => i.severity === "error" && i.message.includes("unknown actor"),
    );
    expect(error).toBeDefined();
  });

  it("flags duplicate step IDs", () => {
    const src = `---
title: Test
actors:
  user: { label: USER, color: "#000000", icon: user }
outcomes:
  pass: { label: PASS, color: "#00ff00" }
---

## Flow

\`\`\`yaml
- type: step
  id: "1"
  actor: user
  title: first
- type: step
  id: "1"
  actor: user
  title: second
\`\`\`
`;
    const doc = parse(src);
    const issues = validate(doc);
    const dup = issues.find((i) => i.message.includes("duplicate"));
    expect(dup).toBeDefined();
  });

  it("flags audit_events.fires_at pointing at unknown IDs", () => {
    const src = `---
title: Test
actors:
  user: { label: USER, color: "#000000", icon: user }
outcomes:
  pass: { label: PASS, color: "#00ff00" }
---

## Flow

\`\`\`yaml
- type: step
  id: "1"
  actor: user
  title: real step
\`\`\`

## Audit Events

\`\`\`yaml
- name: something.happens
  fires_at: ["1"]
- name: something.else
  fires_at: ["99"]
\`\`\`
`;
    const doc = parse(src);
    const issues = validate(doc);
    const bad = issues.find(
      (i) =>
        i.severity === "error" &&
        i.message.includes("fires_at unknown id '99'"),
    );
    expect(bad).toBeDefined();
    // the good reference should not produce any error
    const goodBad = issues.find(
      (i) => i.message.includes("fires_at unknown id '1'"),
    );
    expect(goodBad).toBeUndefined();
  });

  it("warns when an event has empty fires_at and no fires_at_display", () => {
    const src = `---
title: Test
actors:
  user: { label: USER, color: "#000000", icon: user }
outcomes:
  pass: { label: PASS, color: "#00ff00" }
---

## Flow

\`\`\`yaml
- type: step
  id: "1"
  actor: user
  title: real step
\`\`\`

## Audit Events

\`\`\`yaml
- name: orphan.event
\`\`\`
`;
    const doc = parse(src);
    const issues = validate(doc);
    const orphan = issues.find(
      (i) =>
        i.severity === "warning" &&
        i.message.includes("won't be associated with any step"),
    );
    expect(orphan).toBeDefined();
  });
});
