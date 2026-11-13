#!/usr/bin/env node
// skillpr serve — open the review UI in a browser.

import { createReviewServer } from "../src/server.js";

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith("-"));
const portFlag = args.indexOf("--port");
const port = portFlag > -1 ? Number(args[portFlag + 1]) : 4173;

const [oldDir, newDir] = positional;

if (!oldDir || !newDir) {
  process.stderr.write(
    "skillpr serve — needs two skill directories\n\n" +
    "  node bin/skillpr-serve.js <old-dir> <new-dir> [--port 4173]\n\n"
  );
  process.exit(3);
}

const server = createReviewServer({ oldDir, newDir });

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  process.stdout.write(`\n  skillpr review\n  ${url}\n\n  comparing\n    ${oldDir}\n    ${newDir}\n\n  Ctrl+C to stop\n\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { server.close(); process.exit(0); });
}
