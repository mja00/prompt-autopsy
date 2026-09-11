// Builds dist/ — the exact set of files that ship.
//
// Two reasons this exists rather than deploying the repo root:
//   1. og.html, test/ and tools/ must not be reachable in production.
//   2. The canonical/og/twitter URLs have to match the host actually deployed
//      to. They were hardcoded to one host during development, and a wrong
//      absolute og:image means X renders every shared link as a bare text
//      card, which is the entire distribution mechanism.
//
// Usage: node tools/build.mjs [base-url]

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// Required, not defaulted. A bare `node tools/build.mjs` used to fall back to a
// hardcoded host and silently repoint canonical/og:image away from the domain
// actually being deployed to — which is exactly the failure this build step
// exists to prevent. The guard cannot catch that, because it compares the
// output against BASE itself.
if (!process.argv[2]) {
  console.error("usage: node tools/build.mjs <base-url>   e.g. https://prompt-autopsy.pages.dev");
  console.error("       (run `npm run deploy` to build and deploy in one step)");
  process.exit(1);
}
const BASE = process.argv[2].replace(/\/+$/, "");

const FILES = [
  "index.html",
  "styles.css",
  "favicon.svg",
  "manifest.webmanifest",
  "robots.txt",
  "og.png",
  "_headers",
];

const DIRS = ["js"];

const PLACEHOLDER = "https://prompt-autopsy.pages.dev";

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const file of FILES) {
    const from = join(ROOT, file);
    if (!existsSync(from)) throw new Error(`missing required file: ${file}`);
    let contents = await readFile(from);
    if (file.endsWith(".html") || file.endsWith(".txt") || file.endsWith(".webmanifest")) {
      contents = Buffer.from(contents.toString("utf8").split(PLACEHOLDER).join(BASE));
    }
    await writeFile(join(DIST, file), contents);
  }

  for (const dir of DIRS) {
    await cp(join(ROOT, dir), join(DIST, dir), { recursive: true });
  }

  await writeFile(
    join(DIST, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
  );

  // Cheap guard: every absolute URL in the files that carry crawler metadata
  // must point at the host we are actually deploying to. A stale og:image host
  // silently downgrades every shared link to a bare text card, which is the
  // entire distribution mechanism.
  const URL_RE = /https?:\/\/[^\s"'<>)]+/g;
  const METADATA_FILES = ["index.html", "robots.txt", "manifest.webmanifest"];
  for (const file of METADATA_FILES) {
    const text = await readFile(join(DIST, file), "utf8").catch(() => "");
    for (const found of text.match(URL_RE) || []) {
      if (found.startsWith(BASE)) continue;
      throw new Error(`${file} points at ${found}, expected ${BASE}`);
    }
  }
  for (const banned of ["og.html", "test", "tools"]) {
    if (existsSync(join(DIST, banned))) throw new Error(`dev-only path shipped: ${banned}`);
  }

  console.log(`built dist/ for ${BASE}`);
}

await main();
