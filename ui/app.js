// app.js — render the review. No framework, no build step.

const $ = (sel) => document.querySelector(sel);

const state = {
  report: null,
  tab: "findings",
  split: false,
};

// ── helpers ────────────────────────────────────────────────

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const fmtBytes = (n) => {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${abs} B`;
  return `${sign}${(abs / 1024).toFixed(1)} KB`;
};

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

async function copy(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}: ${text}`);
  } catch {
    toast("Copy failed — select the text instead");
  }
}

/** Wrap every matched fragment inside the evidence line. */
function highlightEvidence(evidence, matched) {
  const text = String(evidence ?? "");
  const needles = (Array.isArray(matched) ? matched : [matched])
    .map((m) => String(m ?? "").replace(/…$/, "").trim())
    .filter(Boolean);
  if (!needles.length) return esc(text);

  // Rules clip long matches with an ellipsis, so try shorter prefixes too.
  const hay = text.toLowerCase();
  const ranges = [];
  for (const needle of needles) {
    for (const len of [needle.length, 40, 24, 12]) {
      const probe = needle.slice(0, len).toLowerCase();
      const idx = hay.indexOf(probe);
      if (idx === -1) continue;
      ranges.push([idx, idx + probe.length]);
      break;
    }
  }
  if (!ranges.length) return esc(text);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }

  let out = "";
  let at = 0;
  for (const [start, end] of merged) {
    out += esc(text.slice(at, start)) + "<mark>" + esc(text.slice(start, end)) + "</mark>";
    at = end;
  }
  return out + esc(text.slice(at));
}

// ── render: header + rail ──────────────────────────────────

function renderHeader(r) {
  $("#skillName").textContent = r.newName || r.oldName || "skill";
  $("#range").textContent = r.oldName === r.newName ? "" : `${r.oldName} → ${r.newName}`;

  const delta = r.stats.newBytes - r.stats.oldBytes;
  const filesTouched = r.files.added.length + r.files.removed.length + r.files.changed.length;
  $("#statline").textContent = `${filesTouched} file${filesTouched === 1 ? "" : "s"} · ${fmtBytes(delta)}`;

  const pill = $("#verdictPill");
  pill.dataset.verdict = r.verdict;
  $("#verdictText").textContent = `${r.verdict} ${r.score}`;

  const highs = r.findings.filter(f => f.severity === "high").length;
  const meds = r.findings.filter(f => f.severity === "med").length;
  pill.title =
    `${highs} high, ${meds} medium · score ${r.score} of 200. ` +
    "A summary, not a measurement — read the findings.";

  document.title = `${r.verdict} · ${r.newName} — skillpr`;
}

function renderRail(r) {
  const items = [];
  const countsFor = (path) => {
    const d = r.diffs.find(x => x.path === path);
    if (!d) return "";
    let add = 0, del = 0;
    for (const h of d.hunks) for (const op of h.ops) {
      if (op.type === "add") add++;
      if (op.type === "del") del++;
    }
    return `${add ? `+${add}` : ""}${add && del ? " " : ""}${del ? `−${del}` : ""}`;
  };

  for (const p of r.files.added) items.push({ p, cls: "add", sigil: "+", label: "added" });
  for (const p of r.files.changed) items.push({ p, cls: "mod", sigil: "~", label: "modified" });
  for (const p of r.files.removed) items.push({ p, cls: "del", sigil: "−", label: "removed" });
  for (const p of r.files.unchanged) items.push({ p, cls: "same", sigil: "=", label: "unchanged" });

  $("#fileCount").textContent = String(items.length);

  $("#filelist").innerHTML = items.map((it, i) => `
    <li>
      <button type="button" data-path="${esc(it.p)}" aria-label="${esc(`${it.label} ${it.p}`)}">
        <span class="sigil ${it.cls}" aria-hidden="true">${it.sigil}</span>
        <span class="path">${esc(it.p)}</span>
        <span class="counts">${esc(countsFor(it.p))}</span>
      </button>
    </li>`).join("");
}

// ── render: overview ───────────────────────────────────────

function renderOverview(r) {
  $("#scoreNum").textContent = String(r.score);
  const pct = Math.min(100, (r.score / 200) * 100);
  $("#scoreFill").style.width = `${pct}%`;

  const highs = r.findings.filter(f => f.severity === "high").length;
  $("#scoreMeta").innerHTML = `
    <div><dt>High</dt><dd>${highs}</dd></div>
    <div><dt>Findings</dt><dd>${r.findings.length}</dd></div>
    <div><dt>New hosts</dt><dd>${r.addedHosts.length}</dd></div>
    <div><dt>Files</dt><dd>${r.stats.oldFileCount}→${r.stats.newFileCount}</dd></div>`;

  $("#findingsBadge").textContent = String(r.findings.length);
  $("#diffBadge").textContent = String(r.diffs.length);

  $("#limits").innerHTML = (r.limits || [])
    .slice(1)
    .map((line) => `<li>${esc(line)}</li>`)
    .join("");
}

// ── render: findings ───────────────────────────────────────

function renderFindings(r) {
  const host = $("#findingsList");

  if (!r.findings.length) {
    host.innerHTML = `
      <div class="empty-state">
        <strong>Nothing fired.</strong>
        No rule matched the changed lines. That is not the same as safe —
        read the diff before you approve.
      </div>`;
    return;
  }

  const order = { high: 0, med: 1, low: 2 };
  const sorted = [...r.findings].sort((a, b) => order[a.severity] - order[b.severity]);

  host.innerHTML = sorted.map((f, i) => {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    return `
      <article class="finding" data-sev="${f.severity}" id="finding-${i}" tabindex="-1">
        <div class="finding-head">
          <span class="sev-chip" data-sev="${f.severity}">${esc(f.severity.toUpperCase())}</span>
          <h3 class="finding-title">${esc(f.title)}</h3>
          ${f.count > 1 ? `<span class="finding-count">×${f.count}</span>` : ""}
        </div>
        <div class="loc-row">
          <button class="loc" type="button" data-copy="${esc(loc)}" title="${esc(loc)}" aria-label="${esc(`Copy ${loc}`)}">
            <span class="loc-path">${esc(f.file)}</span>${f.line ? `<span class="loc-line">:${f.line}</span>` : ""}
          </button>
        </div>
        <pre class="evidence">${highlightEvidence(f.evidence, f.matched)}</pre>
        <p class="why">${esc(f.explain)}</p>
      </article>`;
  }).join("");
}

// ── render: diff ───────────────────────────────────────────

function buildSplitRows(ops) {
  const rows = [];
  let i = 0;

  while (i < ops.length) {
    const op = ops[i];

    if (op.type === "ctx") {
      rows.push({ left: op, right: op });
      i++;
      continue;
    }

    const dels = [];
    const adds = [];
    while (i < ops.length && ops[i].type !== "ctx") {
      if (ops[i].type === "del") dels.push(ops[i]);
      else adds.push(ops[i]);
      i++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      rows.push({ left: dels[k] || null, right: adds[k] || null });
    }
  }
  return rows;
}

function renderCode(ops, split) {
  if (!split) {
    return `<div class="code">` + ops.map(op => {
      const cls = op.type === "add" ? "add" : op.type === "del" ? "del" : "ctx";
      const num = op.type === "add" ? op.bNo : op.aNo;
      return `<div class="row ${cls}">
        <span class="num">${num ?? ""}</span>
        <span class="text">${esc(op.text) || "&nbsp;"}</span>
      </div>`;
    }).join("") + `</div>`;
  }

  const rows = buildSplitRows(ops);
  return `<div class="code split">` + rows.map(({ left, right }) => {
    const lType = left ? (left.type === "del" ? "del" : left.type === "add" ? "add" : "ctx") : "blank";
    const rType = right ? (right.type === "add" ? "add" : right.type === "del" ? "del" : "ctx") : "blank";
    const lNum = left ? (left.type === "add" ? "" : left.aNo ?? "") : "";
    const rNum = right ? (right.type === "add" ? right.bNo : right.aNo ?? "") : "";
    return `<div class="row srow">
      <span class="num ${lType}">${lNum}</span>
      <span class="text left ${lType}">${left ? (esc(left.text) || "&nbsp;") : ""}</span>
      <span class="num right ${rType}">${rNum}</span>
      <span class="text right ${rType}">${right ? (esc(right.text) || "&nbsp;") : ""}</span>
    </div>`;
  }).join("") + `</div>`;
}

function renderDiff(r) {
  const host = $("#diffList");

  if (!r.diffs.length) {
    host.innerHTML = `
      <div class="empty-state">
        <strong>Identical.</strong>
        These two versions have the same contents.
      </div>`;
    return;
  }

  host.innerHTML = r.diffs.map(d => {
    const ops = d.hunks.flatMap(h => h.ops);
    let add = 0, del = 0;
    for (const op of ops) { if (op.type === "add") add++; if (op.type === "del") del++; }
    const cls = d.added ? "add" : "mod";

    return `
      <section class="file-block" data-path="${esc(d.path)}">
        <div class="file-head">
          <span class="sigil ${cls}" aria-hidden="true">${d.added ? "+" : "~"}</span>
          <span class="path">${esc(d.path)}</span>
          ${d.added ? `<span class="tag">new file</span>` : ""}
          <span class="delta">
            ${add ? `<span class="plus">+${add}</span>` : ""}
            ${del ? `<span class="minus">−${del}</span>` : ""}
          </span>
        </div>
        ${d.hunks.map(h => `
          <div class="hunk-head">@@ old ${h.aStart ?? 0} · new ${h.bStart ?? 0} @@</div>
          ${renderCode(h.ops, state.split)}
        `).join("")}
      </section>`;
  }).join("");
}

// ── tabs, state, keyboard ──────────────────────────────────

function setTab(tab, { updateUrl = true } = {}) {
  state.tab = tab;
  const isFindings = tab === "findings";

  $("#tab-findings").setAttribute("aria-selected", String(isFindings));
  $("#tab-diff").setAttribute("aria-selected", String(!isFindings));
  $("#tab-findings").classList.toggle("active", isFindings);
  $("#tab-diff").classList.toggle("active", !isFindings);
  $("#panel-findings").hidden = !isFindings;
  $("#panel-diff").hidden = isFindings;

  if (updateUrl) {
    const hash = tab === "diff" && state.split ? "#diff/split" : `#${tab}`;
    history.replaceState(null, "", hash);
  }
}

/** Split view needs two readable columns; below that we stay unified. */
const splitAvailable = () => window.matchMedia("(min-width: 861px)").matches;

function setSplit(on, { updateUrl = true } = {}) {
  if (on && !splitAvailable()) on = false;
  state.split = on;
  const btn = $("#viewToggle");
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "Unified view" : "Split view";
  if (state.report) renderDiff(state.report);
  if (updateUrl && state.tab === "diff") {
    history.replaceState(null, "", on ? "#diff/split" : "#diff");
  }
}

function readHash() {
  const h = location.hash.replace(/^#/, "");
  if (!h) return;
  if (h.startsWith("diff")) setTab("diff", { updateUrl: false });
  if (h.includes("split")) setSplit(true, { updateUrl: false });
}

function wireEvents() {
  $("#tab-findings").addEventListener("click", () => setTab("findings"));
  $("#tab-diff").addEventListener("click", () => setTab("diff"));
  $("#viewToggle").addEventListener("click", () => setSplit(!state.split));

  // arrow-key navigation between tabs
  document.querySelector(".tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = state.tab === "findings" ? "diff" : "findings";
    setTab(next);
    $(`#tab-${next}`).focus();
  });

  document.addEventListener("click", (e) => {
    const copyBtn = e.target.closest("[data-copy]");
    if (copyBtn) { copy(copyBtn.dataset.copy, "Copied"); return; }

    const fileBtn = e.target.closest("#filelist button");
    if (fileBtn) {
      const path = fileBtn.dataset.path;
      setTab("diff");
      const block = document.querySelector(`.file-block[data-path="${CSS.escape(path)}"]`);
      if (block) {
        block.scrollIntoView({ behavior: "smooth", block: "start" });
        block.querySelector(".path")?.focus?.();
      } else {
        toast("This file is unchanged");
      }
      for (const b of document.querySelectorAll("#filelist button")) {
        b.setAttribute("aria-current", String(b === fileBtn));
      }
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.key === "f") { setTab("findings"); $("#tab-findings").focus(); }
    if (e.key === "d") { setTab("diff"); $("#tab-diff").focus(); }
    if (e.key === "s") { setSplit(!state.split); }
  });

  window.addEventListener("hashchange", readHash);

  // Collapsing the window mid-review must not leave a two-column diff in a
  // one-column pane.
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      if (state.split && !splitAvailable()) setSplit(false);
    });
  });
}

// ── boot ───────────────────────────────────────────────────

async function boot() {
  wireEvents();

  let report;
  try {
    const res = await fetch("/api/report");
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    report = await res.json();
  } catch (err) {
    $("#findingsList").innerHTML = `
      <div class="empty-state">
        <strong>Could not load the report.</strong>
        ${esc(err.message)}
      </div>`;
    return;
  }

  state.report = report;
  renderHeader(report);
  renderRail(report);
  renderOverview(report);
  renderFindings(report);
  renderDiff(report);
  readHash();
  if (!location.hash) setTab("findings");
}

boot();
