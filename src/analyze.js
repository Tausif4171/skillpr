// analyze.js — turn two skill folders into one reviewable report.

import { loadSkill, isInstructionFile, isScriptFile } from "./parse.js";
import { diffFiles, diffLines, toHunks } from "./diff.js";
import { checkLine, checkPermissions, extractHosts, SEVERITY } from "./rules.js";

export async function analyze(oldDir, newDir) {
  const [oldSkill, newSkill] = await Promise.all([loadSkill(oldDir), loadSkill(newDir)]);
  const files = diffFiles(oldSkill, newSkill);

  const findings = [];
  const diffs = [];

  // --- frontmatter -------------------------------------------------------
  const fmChanges = [];
  const keys = new Set([
    ...Object.keys(oldSkill.frontmatter || {}),
    ...Object.keys(newSkill.frontmatter || {}),
  ]);
  for (const key of keys) {
    const before = oldSkill.frontmatter?.[key];
    const after = newSkill.frontmatter?.[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    fmChanges.push({ key, before, after });
  }
  findings.push(...checkPermissions(oldSkill.frontmatter, newSkill.frontmatter));

  // --- text files --------------------------------------------------------
  const touched = [...files.changed, ...files.added];

  for (const path of touched) {
    const before = files.oldMap.get(path);
    const after = files.newMap.get(path);
    if (!after?.isText) continue;

    const oldLines = before?.isText ? before.lines : [];
    const newLines = after.lines || [];
    const ops = diffLines(oldLines, newLines);
    const hunks = toHunks(ops, 3);
    if (hunks.length) diffs.push({ path, added: !before, hunks });

    const kind = isInstructionFile(path) ? "prose" : "any";
    for (const op of ops) {
      if (op.type !== "add") continue;
      findings.push(...checkLine({
        text: op.text,
        file: path,
        lineNo: op.bNo,
        kind,
      }));
    }
  }

  // --- new outbound hosts -------------------------------------------------
  const oldHosts = collectHosts(oldSkill);
  const newHosts = collectHosts(newSkill);
  const addedHosts = [...newHosts].filter(h => !oldHosts.has(h));

  // --- score --------------------------------------------------------------
  // Deduplicate by rule id: ten curl lines are one problem, not ten. But a
  // permission rule fires once per tool, so the tool names are collected and
  // named in the title — otherwise "Bash" hides behind "Write".
  const byRule = new Map();
  for (const f of findings) {
    const seen = byRule.get(f.id);
    if (!seen) {
      byRule.set(f.id, { ...f, count: 1, subjects: f.subject ? [f.subject] : [] });
      continue;
    }
    seen.count += 1;
    if (f.subject && !seen.subjects.includes(f.subject)) seen.subjects.push(f.subject);
  }

  const unique = [...byRule.values()].map((f) => {
    if (!f.subjects.length) return f;
    return { ...f, title: `${f.title}: ${f.subjects.join(", ")}`, matched: f.subjects };
  });
  const score = unique.reduce((sum, f) => sum + f.weight, 0);

  const highs = unique.filter(f => f.severity === "high");
  const meds = unique.filter(f => f.severity === "med");
  const verdict = highs.length ? "BLOCK" : meds.length ? "REVIEW" : "CLEAN";

  return {
    oldName: oldSkill.name,
    newName: newSkill.name,
    frontmatter: fmChanges,
    files: {
      added: files.added,
      removed: files.removed,
      changed: files.changed,
      unchanged: files.unchanged,
    },
    diffs,
    findings: unique,
    addedHosts,
    score,
    verdict,
    stats: {
      oldBytes: oldSkill.files.reduce((s, f) => s + f.bytes, 0),
      newBytes: newSkill.files.reduce((s, f) => s + f.bytes, 0),
      oldFileCount: oldSkill.files.length,
      newFileCount: newSkill.files.length,
      riskyLines: findings.length,
    },
    limits: [
      "Shows what changed. Does not prove the skill is safe.",
      "Never runs or sandboxes the skill.",
      "A rule can be evaded by rephrasing; absence of findings is not approval.",
    ],
    severityWeights: SEVERITY,
    scripts: touched.filter(isScriptFile),
  };
}

function collectHosts(skill) {
  const lines = [];
  for (const f of skill.files) if (f.isText && f.lines) lines.push(...f.lines);
  return extractHosts(lines);
}
