// report.js — human-readable review, and the same thing as JSON.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const c = (code) => (s) => useColor ? `\u001b[${code}m${s}\u001b[0m` : String(s);
const dim = c("2");
const bold = c("1");
const red = c("31");
const yellow = c("33");
const green = c("32");
const cyan = c("36");
const magenta = c("35");

const ICON = { high: "●", med: "◐", low: "○" };
const COLOR = { high: red, med: yellow, low: cyan };

function sev(s) {
  return COLOR[s](`${ICON[s]} ${s.toUpperCase().padEnd(5)}`);
}

function fileBadge(path, kind) {
  if (kind === "add") return green("+") + " " + path;
  if (kind === "del") return red("-") + " " + path;
  return yellow("~") + " " + path;
}

export function render(report, { showDiff = true } = {}) {
  const out = [];
  const line = (s = "") => out.push(s);
  const rule = () => line(dim("─".repeat(68)));

  line();
  line(bold(`skillpr  ${report.oldName}  →  ${report.newName}`));
  line(dim(
    `${report.stats.oldFileCount} → ${report.stats.newFileCount} files · ` +
    `${signed(report.stats.newBytes - report.stats.oldBytes)} bytes · ` +
    `score ${report.score}`
  ));
  rule();

  // ---- files
  const f = report.files;
  if (f.added.length || f.removed.length || f.changed.length) {
    line(bold("FILES CHANGED"));
    for (const p of f.added) line("  " + fileBadge(p, "add"));
    for (const p of f.removed) line("  " + fileBadge(p, "del"));
    for (const p of f.changed) {
      const d = report.diffs.find(x => x.path === p);
      const counts = d ? countOps(d) : { add: 0, del: 0 };
      line("  " + fileBadge(p, "mod") + dim(`  +${counts.add} −${counts.del}`));
    }
    if (f.unchanged.length) line("  " + dim(`${f.unchanged.length} file(s) unchanged`));
    line();
  } else {
    line(dim("No file changed. These two versions are identical."));
    line();
  }

  // ---- frontmatter
  if (report.frontmatter.length) {
    line(bold("FRONTMATTER"));
    for (const ch of report.frontmatter) {
      line(`  ${magenta(ch.key)}`);
      if (ch.before !== undefined) line(red(`    − ${fmt(ch.before)}`));
      if (ch.after !== undefined) line(green(`    + ${fmt(ch.after)}`));
    }
    line();
  }

  // ---- diff
  if (showDiff && report.diffs.length) {
    line(bold("WHAT CHANGED IN THE INSTRUCTIONS"));
    for (const d of report.diffs) {
      line(`  ${cyan(d.path)}${d.added ? dim("  (new file)") : ""}`);
      for (const h of d.hunks) {
        const aStart = h.aStart ?? 0;
        const bStart = h.bStart ?? 0;
        line(dim(`    @@ old ${aStart} · new ${bStart} @@`));
        for (const op of h.ops) {
          const num = String(op.bNo ?? op.aNo ?? "").padStart(4);
          if (op.type === "add") line(green(`   ${num} + ${op.text}`));
          else if (op.type === "del") line(red(`   ${num} − ${op.text}`));
          else line(dim(`   ${num}   ${op.text}`));
        }
      }
    }
    line();
  }

  // ---- hosts
  if (report.addedHosts.length) {
    line(bold("NEW NETWORK DESTINATIONS"));
    for (const h of report.addedHosts) line("  " + yellow("→") + " " + h);
    line(dim("  A new host can change after you approve the skill."));
    line();
  }

  // ---- findings
  rule();
  const vLabel = {
    BLOCK: red(bold("BLOCK")),
    REVIEW: yellow(bold("REVIEW")),
    CLEAN: green(bold("CLEAN")),
  }[report.verdict];
  line(`${bold("VERDICT")}  ${vLabel}   ${dim(`score ${report.score}`)}`);
  line();

  if (report.findings.length === 0) {
    line(dim("No rule fired. That is not the same as safe — re-read the diff above."));
  } else {
    const order = { high: 0, med: 1, low: 2 };
    const sorted = [...report.findings].sort((a, b) => order[a.severity] - order[b.severity]);
    for (const fi of sorted) {
      line(`${sev(fi.severity)}  ${bold(fi.title)}${fi.count > 1 ? dim(`  ×${fi.count}`) : ""}`);
      const loc = fi.line ? `${fi.file}:${fi.line}` : fi.file;
      line("         " + dim(loc));
      line("         " + dim("> ") + truncate(fi.evidence, 78));
      line("         " + dim(wordWrap(fi.explain, 76, "         ")));
      line();
    }
  }

  // ---- footer
  rule();
  line(dim("This tool shows what changed. It does not prove a skill is safe."));
  line(dim("It never runs the skill and never sandboxes it."));
  line();
  return out.join("\n");
}

function countOps(d) {
  let add = 0, del = 0;
  for (const h of d.hunks) for (const op of h.ops) {
    if (op.type === "add") add++;
    if (op.type === "del") del++;
  }
  return { add, del };
}

function signed(n) { return n >= 0 ? `+${n}` : `${n}`; }

function fmt(v) {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(empty)";
  if (v === undefined) return "(absent)";
  if (v === "") return "(empty)";
  return String(v);
}

function truncate(s, n) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

function wordWrap(s, width, indent) {
  const words = String(s).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) { lines.push(cur.trim()); cur = w; }
    else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.join("\n" + indent);
}

export function renderJson(report) {
  return JSON.stringify(report, null, 2);
}
