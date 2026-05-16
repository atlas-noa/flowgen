import yaml from "js-yaml";
import { FlowDoc, type FlowDocT } from "./schema.js";

// ---------------------------------------------------------------------------
// Tiny frontmatter splitter — replaces gray-matter so the parser stays
// browser-friendly (no Buffer, no Node-only deps). Supports the standard
// "---\n<yaml>\n---\n<body>" shape that gray-matter produces and nothing
// fancier — we don't need engines, excerpts, or content options.
// ---------------------------------------------------------------------------

function splitFrontmatter(source: string): { data: Record<string, unknown>; content: string } {
  // Tolerate a BOM and any leading whitespace before the first delimiter.
  const stripped = source.replace(/^﻿/, "");
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(stripped);
  if (!match) {
    // No frontmatter present — content is the whole source, data is empty.
    return { data: {}, content: stripped };
  }
  const yamlBlock = match[1];
  const content = stripped.slice(match[0].length);
  let data: unknown;
  try {
    data = yaml.load(yamlBlock);
  } catch (err) {
    throw new ParseError(
      `failed to parse frontmatter YAML: ${(err as Error).message}`,
      "frontmatter",
      err,
    );
  }
  if (data === null || data === undefined) return { data: {}, content };
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new ParseError(
      `frontmatter must be a YAML mapping, got ${Array.isArray(data) ? "array" : typeof data}`,
      "frontmatter",
    );
  }
  return { data: data as Record<string, unknown>, content };
}

// ---------------------------------------------------------------------------
// Parser
//
// Reads an MD file shaped like:
//
//   ---
//   <frontmatter YAML>
//   ---
//
//   ## Flow
//
//   ```yaml
//   <flow list>
//   ```
//
//   ## Terminal States
//
//   ```yaml
//   <terminal-state groups>
//   ```
//
//   ## Audit Events
//
//   ```yaml
//   <event index>
//   ```
//
//   ## Footnotes
//
//   ```yaml
//   <footnotes>
//   ```
//
// Each section's YAML code-block is parsed independently, then the whole thing
// is glued back together as a FlowDoc and validated by the Zod schema.
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly section?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

interface RawSections {
  flow: unknown;
  terminal_states: unknown;
  audit_events: unknown;
  footnotes: unknown;
}

const SECTION_ALIASES: Record<string, keyof RawSections> = {
  flow: "flow",
  "terminal states": "terminal_states",
  "terminal-states": "terminal_states",
  "audit events": "audit_events",
  "audit-events": "audit_events",
  footnotes: "footnotes",
  footnote: "footnotes",
};

/**
 * Split the markdown body into named sections keyed by their `##` headers,
 * pulling the first ```yaml fenced block out of each section.
 *
 * Sections without a yaml block are silently empty (e.g. an empty
 * ## Footnotes is allowed).
 */
function extractSections(body: string): RawSections {
  const sections: RawSections = {
    flow: undefined,
    terminal_states: undefined,
    audit_events: undefined,
    footnotes: undefined,
  };

  // Find every level-2 header. Each section spans from the end of its own
  // header line to the start of the next header (or EOF for the last one).
  const headerRe = /^##\s+(.+)$/gm;
  const headers: Array<{ name: string; bodyStart: number; bodyEnd: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(body)) !== null) {
    headers.push({
      name: match[1].trim().toLowerCase(),
      bodyStart: match.index + match[0].length,
      bodyEnd: -1,
    });
  }
  for (let i = 0; i < headers.length; i++) {
    headers[i].bodyEnd =
      i + 1 < headers.length ? body.lastIndexOf("\n", headers[i + 1].bodyStart - headers[i + 1].name.length) : body.length;
    if (headers[i].bodyEnd < headers[i].bodyStart) {
      headers[i].bodyEnd = body.length;
    }
  }

  // Authors can wrap section content in a ```yaml fenced block (legacy
  // habit, helps some editors syntax-highlight) OR just write the YAML
  // directly under the heading. We prefer the fenced block when present —
  // it lets authors mix prose with YAML inside one section — and fall back
  // to treating the entire section body as YAML.
  const yamlBlockRe = /```ya?ml\s*\n([\s\S]*?)\n```/i;

  for (const h of headers) {
    const key = SECTION_ALIASES[h.name];
    if (!key) continue;
    const slice = body.slice(h.bodyStart, h.bodyEnd);
    const fenced = yamlBlockRe.exec(slice);
    const yamlSource = fenced ? fenced[1] : slice.trim();
    if (!yamlSource) continue;
    try {
      sections[key] = yaml.load(yamlSource);
    } catch (err) {
      throw new ParseError(
        `failed to parse YAML in ## ${h.name}: ${(err as Error).message}`,
        h.name,
        err,
      );
    }
  }

  return sections;
}

export interface ParseOptions {
  /** When true, throw on schema validation failure; when false, return the doc unchecked (used in tests). */
  strict?: boolean;
}

export function parse(source: string, opts: ParseOptions = {}): FlowDocT {
  const { data: frontmatter, content } = splitFrontmatter(source);
  const sections = extractSections(content);

  const candidate = {
    frontmatter,
    flow: sections.flow ?? [],
    terminal_states: sections.terminal_states ?? [],
    audit_events: sections.audit_events ?? [],
    footnotes: sections.footnotes ?? [],
  };

  const result = FlowDoc.safeParse(candidate);
  if (!result.success) {
    if (opts.strict === false) {
      // Return the raw candidate cast; intended for tests that want to inspect
      // intermediate shape before schema enforcement.
      return candidate as unknown as FlowDocT;
    }
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`,
    );
    throw new ParseError(
      `FlowDoc failed schema validation:\n${lines.join("\n")}`,
      undefined,
      result.error,
    );
  }
  return result.data;
}
