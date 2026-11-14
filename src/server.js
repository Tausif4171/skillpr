// server.js — local review server for skillpr.
// Serves the UI and one JSON endpoint. No framework, no dependencies.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "./analyze.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const UI_DIR = resolve(here, "..", "ui");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

/** Cache: analysing the same pair twice is pointless during a demo. */
const cache = new Map();

export function createReviewServer({ oldDir, newDir, label } = {}) {
  const resolvedOld = oldDir ? resolve(oldDir) : null;
  const resolvedNew = newDir ? resolve(newDir) : null;

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");

      if (url.pathname === "/api/report") {
        const o = url.searchParams.get("old") || resolvedOld;
        const n = url.searchParams.get("new") || resolvedNew;
        if (!o || !n) return send(res, 400, { error: "Pass ?old= and ?new=, or start with two directories." });

        const key = `${o}::${n}`;
        let report = cache.get(key);
        if (!report) {
          report = await analyze(o, n);
          report.label = label || null;
          // Where the two versions actually came from. The page shows this so a
          // reviewer can see the folder pair instead of taking it on trust.
          report.oldPath = resolve(o);
          report.newPath = resolve(n);
          cache.set(key, report);
        }
        return send(res, 200, report);
      }

      if (url.pathname === "/api/health") return send(res, 200, { ok: true });

      // static
      const rel = url.pathname === "/" ? "/index.html" : url.pathname;
      const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
      const file = join(UI_DIR, safe);
      if (!file.startsWith(UI_DIR + sep) && file !== join(UI_DIR, "index.html")) {
        return send(res, 403, { error: "forbidden" });
      }
      const s = await stat(file).catch(() => null);
      if (!s?.isFile()) return send(res, 404, { error: "not found" });

      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      });
      res.end(body);
    } catch (err) {
      send(res, 500, { error: String(err?.message || err) });
    }
  });
}

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(body);
}
