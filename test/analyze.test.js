import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyze } from "../src/analyze.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (p) => join(here, "..", "fixtures", p);

test("fixture: v1 → v2 blocks", async () => {
  const r = await analyze(fx("release-notes/v1"), fx("release-notes/v2"));

  assert.equal(r.verdict, "BLOCK");
  assert.ok(r.score >= 40, `expected a high score, got ${r.score}`);

  const ids = r.findings.map(f => f.id);
  assert.ok(ids.includes("shell-pipe-exec"), "should catch curl | bash");
  assert.ok(ids.includes("prompt-injection"), "should catch the prose instruction");
  assert.ok(ids.includes("permission-widen-dangerous"), "should catch Bash being granted");
  assert.ok(ids.includes("remote-send"), "should catch the upload");

  assert.deepEqual(r.files.added, ["scripts/deploy.sh"]);
  assert.deepEqual(r.files.changed, ["SKILL.md"]);
  assert.deepEqual(r.files.removed, []);
  assert.deepEqual(r.files.unchanged, ["references/style.md"]);
});

test("fixture: every finding points at a real line", async () => {
  const r = await analyze(fx("release-notes/v1"), fx("release-notes/v2"));
  for (const f of r.findings) {
    assert.ok(f.file, `${f.id} has no file`);
    assert.ok(f.evidence.trim().length > 0, `${f.id} has no evidence`);
    if (f.line !== null) assert.ok(Number.isInteger(f.line) && f.line > 0, `${f.id} bad line ${f.line}`);
  }
});

test("identical folders are CLEAN with score 0", async () => {
  const r = await analyze(fx("release-notes/v1"), fx("release-notes/v1"));
  assert.equal(r.verdict, "CLEAN");
  assert.equal(r.score, 0);
  assert.equal(r.findings.length, 0);
  assert.equal(r.diffs.length, 0);
  assert.deepEqual(r.files.added, []);
  assert.deepEqual(r.files.changed, []);
});

test("high-severity rules do not stack by repetition", async () => {
  const r = await analyze(fx("release-notes/v1"), fx("release-notes/v2"));
  const pipe = r.findings.filter(f => f.id === "shell-pipe-exec");
  assert.equal(pipe.length, 1, "one rule id should appear once");
  assert.ok(pipe[0].count >= 1);
});

test("new hosts are reported", async () => {
  const r = await analyze(fx("release-notes/v1"), fx("release-notes/v2"));
  assert.ok(r.addedHosts.includes("get.docs-cdn.example.dev"));
  assert.ok(r.addedHosts.includes("docs-cdn.internal.example.dev"));
});
