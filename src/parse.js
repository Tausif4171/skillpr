// parse.js — read a skill folder into a plain, comparable shape.
// A skill is a directory with a SKILL.md in it. We do not assume anything else.

import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, sep, posix } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".DS_Store", "dist", "build"]);
const TEXT_EXT = /\.(md|markdown|txt|json|ya?ml|sh|bash|zsh|js|mjs|cjs|ts|py|rb|toml|ini|cfg)$/i;

/** Recursively collect files under root, skipping noise. Returns sorted relative posix paths. */
export async function walk(root) {
  const out = [];
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env") continue;
      if (SKIP.has(e.name)) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) await visit(abs);
      else if (e.isFile()) out.push(relative(root, abs).split(sep).join("/"));
    }
  }
  await visit(root);
  return out.sort();
}

/**
 * Minimal frontmatter parser. Handles the subset skills actually use:
 *   key: value
 *   key: [a, b]
 *   key:
 *     - a
 *     - b
 * Returns { data, bodyLine } where bodyLine is the 1-based line where the body starts.
 */
export function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { data: {}, bodyLine: 1, has: false };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return { data: {}, bodyLine: 1, has: false };

  const data = {};
  let currentKey = null;
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;

    const listItem = raw.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(stripQuotes(listItem[1].trim()));
      continue;
    }

    const kv = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      currentKey = kv[1];
      const value = kv[2].trim();
      if (value === "") { data[currentKey] = []; continue; }
      const inline = value.match(/^\[(.*)\]$/);
      data[currentKey] = inline
        ? inline[1].split(",").map(s => stripQuotes(s.trim())).filter(Boolean)
        : stripQuotes(value);
      continue;
    }
    currentKey = null;
  }

  return { data, bodyLine: end + 2, has: true };
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Load a skill directory into { root, files[], skillmd } */
export async function loadSkill(root) {
  let isDir = false;
  try { isDir = (await stat(root)).isDirectory(); } catch { /* not a dir */ }
  if (!isDir) throw new Error(`Not a directory: ${root}`);

  const paths = await walk(root);
  const files = [];

  for (const rel of paths) {
    const abs = join(root, rel.split("/").join(sep));
    const buf = await readFile(abs);
    const isText = TEXT_EXT.test(rel) || buf.length < 512;
    const content = isText ? buf.toString("utf8") : null;
    files.push({
      path: rel,
      isText: content !== null,
      bytes: buf.length,
      hash: createHash("sha256").update(buf).digest("hex"),
      content,
      lines: content !== null ? content.split(/\r?\n/) : null,
    });
  }

  const skillmd = files.find(f => f.path.toLowerCase() === "skill.md") || null;
  const fm = skillmd?.content ? parseFrontmatter(skillmd.content) : { data: {}, bodyLine: 1, has: false };

  return {
    root,
    files,
    skillmd,
    frontmatter: fm.data,
    bodyLine: fm.bodyLine,
    name: fm.data.name || relBase(root),
  };
}

function relBase(p) {
  return p.split(sep).filter(Boolean).pop() || p;
}

/** Only these files carry agent-facing instructions. */
export function isInstructionFile(path) {
  const p = path.toLowerCase();
  if (p === "skill.md") return true;
  if (p.endsWith(".md") || p.endsWith(".markdown") || p.endsWith(".txt")) return true;
  return false;
}

/** Scripts can execute. They get flagged harder than prose. */
export function isScriptFile(path) {
  return /\.(sh|bash|zsh|js|mjs|cjs|ts|py|rb)$/i.test(path);
}

export { posix };
