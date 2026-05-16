import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";
import { render } from "../src/renderer.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "fixtures/recovery-flow.md");
const source = readFileSync(fixturePath, "utf-8");
const doc = parse(source);

describe("renderer — smoke tests against the recovery-flow fixture", () => {
  const html = render(doc);

  it("produces a complete HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Account Recovery Flow</title>");
    expect(html).toContain("</html>");
  });

  it("includes the Tailwind CDN script by default", () => {
    expect(html).toContain("https://cdn.tailwindcss.com");
  });

  it("renders the header with kicker, serif title, and lead paragraph", () => {
    expect(html).toContain("self-service device recovery");
    expect(html).toContain("Account Recovery Flow");
    expect(html).toContain("Mobile-initiated recovery using context-aware");
    expect(html).toContain("3px solid #0c0a09"); // header divider
  });

  it("renders the legend with all three actors and both outcomes", () => {
    expect(html).toContain("USER");
    expect(html).toContain("BACKEND");
    expect(html).toContain("MANAGER");
    expect(html).toMatch(/>PASS</);
    expect(html).toMatch(/>FAIL</);
    expect(html).toContain("event.name.here"); // legend sample pill
  });

  it("renders linear steps and auto-injects arrows between them", () => {
    // 6 + 7 + 4 + 4 + 1 + 4 + 1 + 1 = 28 default-arrow inserts when stepping through
    // the fixture. Easier sanity check: count the inline arrowhead SVG path.
    const arrowheads = html.match(/M 0 0 L 12 0 L 6 10 Z/g) ?? [];
    expect(arrowheads.length).toBeGreaterThan(20);
  });

  it("renders the decision chip with the hex clip-path", () => {
    expect(html).toContain("PASSES THRESHOLD?");
    expect(html).toContain("polygon(10px 0, calc(100% - 10px) 0");
  });

  it("renders the fork's path-label pills with outcome colors", () => {
    expect(html).toContain("YES · PASS");
    expect(html).toContain("NO · FAIL");
    // success green hex appears on the YES leg + branch border
    expect(html).toMatch(/#059669/i);
    // blocked red hex on the NO leg + branch border
    expect(html).toMatch(/#dc2626/i);
  });

  it("renders the auto-approved branch with its 5px left border", () => {
    expect(html).toContain("Auto-approved");
    expect(html).toContain("Threshold met · no manager involvement");
    // 5px solid colored left border is the branch signature
    expect(html).toMatch(/border-left: 5px solid #059669/i);
  });

  it("renders the reroute bridge", () => {
    expect(html).toContain("DID NOT PASS THRESHOLD");
    expect(html).toContain("Flow diverts here from step 07");
  });

  it("injects audit-event pills onto steps via fires_at reverse lookup", () => {
    // The TSX has a pill `recovery.request` on step 03 — we should too.
    expect(html).toContain("recovery.request");
    expect(html).toContain("auth.totp.verify");
    // The dispute event lives in the audit index AND on the side branch.
    const disputeHits = html.match(/recovery\.dispute\.create/g) ?? [];
    expect(disputeHits.length).toBeGreaterThanOrEqual(2);
  });

  it("renders the audit event index at the bottom with fires_at_display", () => {
    expect(html).toContain("AUDIT EVENT INDEX");
    expect(html).toContain("async (any time post-03)"); // the override label
  });

  it("renders the terminal-state summary cards", () => {
    expect(html).toContain("PASS · 2 TERMINAL STATES");
    expect(html).toContain("FAIL · 3 TERMINAL STATES");
    expect(html).toContain("Auto-approved (8.4)");
  });

  it("renders the footnotes with bolded label prefixes", () => {
    expect(html).toContain("DEMO SCOPE LIMITATIONS ·");
    expect(html).toContain("RISK SIGNALS IN SCOPE ·");
    expect(html).toContain("EVENT NAMING NOTE ·");
  });

  it("body-only mode skips the <html>/<head> chrome", () => {
    const body = render(doc, { bodyOnly: true });
    expect(body).not.toContain("<!doctype html>");
    expect(body).not.toContain("<title>");
    expect(body).toContain("Account Recovery Flow");
  });
});
