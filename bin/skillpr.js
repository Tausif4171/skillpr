#!/usr/bin/env node
// skillpr — a pull request for agent skills.

import { analyze } from "../src/analyze.js";
import { render, renderJson } from "../src/report.js";

const HELP = `
skillpr — a pull request for agent skills

  skillpr diff <old-dir> <new-dir> [flags]

  Compares two versions of a skill folder and reports what changed,
  with a verdict. Every finding quotes the exact line that caused it.

Flags
  --json       machine-readable output
  --no-diff    summary only, skip the line diff
  --no-color   plain text

Exit codes
  0  CLEAN   nothing fired
  1  REVIEW  medium-risk findings, a human should look
  2  BLOCK   high-risk findings
  3  error

A skill is a directory containing SKILL.md.
`;

function parseArgs(argv) {
  const args = { _: [], json: false, diff: true };
  for (const a of argv) {
    if (a === "--json") args.json = true;
    else if (a === "--no-diff") args.diff = false;
    else if (a === "--no-color") process.env.NO_COLOR = "1";
    else if (a === "-h" || a === "--help") args.help = true;
    else args._.push(a);
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help || args._.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  const [cmd, oldDir, newDir] = args._;

  if (cmd !== "diff") {
    process.stderr.write(`Unknown command: ${cmd}\n${HELP}`);
    return 3;
  }
  if (!oldDir || !newDir) {
    process.stderr.write("Need two directories: skillpr diff <old> <new>\n");
    return 3;
  }

  let report;
  try {
    report = await analyze(oldDir, newDir);
  } catch (err) {
    process.stderr.write(`skillpr: ${err.message}\n`);
    return 3;
  }

  if (args.json) {
    process.stdout.write(renderJson(report) + "\n");
  } else {
    process.stdout.write(render(report, { showDiff: args.diff }) + "\n");
  }

  return report.verdict === "BLOCK" ? 2 : report.verdict === "REVIEW" ? 1 : 0;
}

main()
  .then(code => process.exit(code))
  .catch(err => {
    process.stderr.write(`skillpr: ${err?.stack || err}\n`);
    process.exit(3);
  });
