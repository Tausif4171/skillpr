// diff.js — line diff with no dependencies.
// Small files only; anything huge degrades to "whole file replaced" rather than hanging.

const MAX_CELLS = 4_000_000; // ~2000x2000

/**
 * Longest-common-subsequence line diff.
 * Returns ops: { type: "ctx" | "add" | "del", text, aNo, bNo }
 */
export function diffLines(a, b) {
  const n = a.length, m = b.length;

  if (n * m > MAX_CELLS) {
    const ops = [];
    a.forEach((t, i) => ops.push({ type: "del", text: t, aNo: i + 1, bNo: null }));
    b.forEach((t, i) => ops.push({ type: "add", text: t, aNo: null, bNo: i + 1 }));
    return ops;
  }

  // lcs[i][j] = length of LCS of a[i:], b[j:]
  const width = m + 1;
  const lcs = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i] === b[j]
        ? lcs[(i + 1) * width + (j + 1)] + 1
        : Math.max(lcs[(i + 1) * width + j], lcs[i * width + (j + 1)]);
    }
  }

  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "ctx", text: a[i], aNo: i + 1, bNo: j + 1 });
      i++; j++;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + (j + 1)]) {
      ops.push({ type: "del", text: a[i], aNo: i + 1, bNo: null });
      i++;
    } else {
      ops.push({ type: "add", text: b[j], aNo: null, bNo: j + 1 });
      j++;
    }
  }
  while (i < n) { ops.push({ type: "del", text: a[i], aNo: i + 1, bNo: null }); i++; }
  while (j < m) { ops.push({ type: "add", text: b[j], aNo: null, bNo: j + 1 }); j++; }
  return ops;
}

/** Collapse ops into hunks with N lines of context. */
export function toHunks(ops, context = 3) {
  const keep = new Set();
  ops.forEach((op, idx) => {
    if (op.type === "ctx") return;
    for (let k = idx - context; k <= idx + context; k++) {
      if (k >= 0 && k < ops.length) keep.add(k);
    }
  });
  if (keep.size === 0) return [];

  const idxs = [...keep].sort((x, y) => x - y);
  const hunks = [];
  let cur = null;

  for (const idx of idxs) {
    if (!cur || idx > cur.lastIdx + 1) {
      if (cur) hunks.push(cur);
      cur = { ops: [], lastIdx: -1, aStart: null, bStart: null };
    }
    const op = ops[idx];
    if (cur.ops.length === 0) {
      cur.aStart = op.aNo ?? null;
      cur.bStart = op.bNo ?? null;
    }
    cur.ops.push(op);
    cur.lastIdx = idx;
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/** Compare two loaded skills at the file level. */
export function diffFiles(oldSkill, newSkill) {
  const oldMap = new Map(oldSkill.files.map(f => [f.path, f]));
  const newMap = new Map(newSkill.files.map(f => [f.path, f]));

  const added = [...newMap.keys()].filter(p => !oldMap.has(p)).sort();
  const removed = [...oldMap.keys()].filter(p => !newMap.has(p)).sort();
  const changed = [...newMap.keys()]
    .filter(p => oldMap.has(p) && oldMap.get(p).hash !== newMap.get(p).hash)
    .sort();
  const unchanged = [...newMap.keys()]
    .filter(p => oldMap.has(p) && oldMap.get(p).hash === newMap.get(p).hash)
    .sort();

  return { added, removed, changed, unchanged, oldMap, newMap };
}
