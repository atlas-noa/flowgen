#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { parse } from "./parser.js";
import { validate, hasErrors } from "./validate.js";
import { render } from "./renderer.js";

function usage(): never {
  console.error(`usage: flowgen <input.md> [--html] [-o <output>]

modes:
  (default)   parse and print the FlowDoc as JSON to stdout
  --html      render to a self-contained HTML document

options:
  -o <path>   write to <path> instead of stdout (HTML mode only)
`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) usage();

let inputArg: string | undefined;
let mode: "json" | "html" = "json";
let outPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--html") mode = "html";
  else if (a === "-o") outPath = args[++i];
  else if (!inputArg) inputArg = a;
  else usage();
}

if (!inputArg) usage();

const path = resolve(process.cwd(), inputArg);
const source = readFileSync(path, "utf-8");

const doc = parse(source);
const issues = validate(doc);

if (mode === "html") {
  const html = render(doc);
  const target =
    outPath ?? resolve(process.cwd(), `${basename(inputArg, extname(inputArg))}.html`);
  writeFileSync(target, html, "utf-8");
  console.error(`wrote ${target}`);
} else {
  console.log(JSON.stringify(doc, null, 2));
}

if (issues.length > 0) {
  const errCount = issues.filter((i) => i.severity === "error").length;
  const warnCount = issues.filter((i) => i.severity === "warning").length;
  console.error(`\n${errCount} error(s), ${warnCount} warning(s):`);
  for (const issue of issues) {
    console.error(`  [${issue.severity}] ${issue.path}: ${issue.message}`);
  }
  if (hasErrors(issues)) process.exit(2);
} else {
  console.error("\nValidation: clean (0 errors, 0 warnings)");
}
