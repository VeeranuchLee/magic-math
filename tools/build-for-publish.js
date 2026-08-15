#!/usr/bin/env node
/* Compile the JSX out of the games, for publishing only.
 *
 * Why this exists: the games ship a whole JavaScript compiler to the child's
 * device and run it at every launch. Babel is 629 KB over the wire but 2,914 KB
 * once decompressed, and it exists only to turn ~166 KB of inline JSX into
 * React.createElement calls -- the same work, on the same input, every single
 * time a game opens. It is 56% of what is downloaded and 83% of what is parsed,
 * and it is why launch is slow on an old iPad and invisible on a laptop.
 *
 * Design decisions worth knowing before you change anything here:
 *
 *   * This NEVER writes into the repository. It takes a target directory -- a
 *     copy of math-app made during publish -- and rewrites that. The five HTML
 *     files in git stay exactly what they were: single, self-contained, with
 *     hand-editable inline JSX. That property is the whole reason the owner
 *     chose in-browser Babel on 2026-08-14, and losing it is not on the table.
 *     Run this against a scratch copy to test the published artefact locally.
 *
 *   * It uses the app's OWN vendored Babel, in Node. Same compiler, same pinned
 *     7.26.4, no new dependency and no second implementation that could drift
 *     from what the browser was doing.
 *
 *   * Presets are `react` only, which is a DELIBERATE divergence from what the
 *     browser does today. A <script type="text/babel"> with no data-presets gets
 *     ["react", "env"], and env with no targets downlevels everything to ES5 --
 *     so today's games are compiled to ES5 on the fly at every launch. Nothing
 *     needs that: the runtime floor is already Safari 14 / iOS 14, set
 *     independently by WebP, service workers and React 18. The sources use
 *     optional chaining and nullish coalescing, both native there. Emitting
 *     modern JS is smaller and faster to parse than the ES5 it replaces.
 *     magic-spelling.html already asked for data-presets="react", so for that
 *     one this is an exact match rather than a divergence.
 *
 *   * index.html and classical-music.html are untouched on purpose -- they are
 *     plain DOM JavaScript and load neither React nor Babel.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const TARGET = process.argv[2];
if (!TARGET) {
  console.error("usage: node tools/build-for-publish.js <target-dir>");
  console.error("  <target-dir> is a COPY of math-app. This never writes to the repo.");
  process.exit(2);
}
if (!fs.existsSync(path.join(TARGET, "service-worker.js"))) {
  console.error(`refusing to run: ${TARGET} does not look like a math-app copy`);
  process.exit(2);
}

const BABEL_VENDOR = "vendor/babel-7.26.4.min.js";
// Only these three load React; the other two pages are plain DOM JavaScript.
const JSX_PAGES = ["space-math.html", "unicorn-math.html", "magic-spelling.html"];

const Babel = require(path.resolve(__dirname, "..", BABEL_VENDOR));

const SCRIPT_RE = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const BABEL_TAG_RE = new RegExp(
  `[ \\t]*<script src="\\./${BABEL_VENDOR.replace(/[.\-\/]/g, "\\$&")}"><\\/script>\\r?\\n`
);

let before = 0;
let after = 0;

for (const page of JSX_PAGES) {
  const file = path.join(TARGET, page);
  const src = fs.readFileSync(file, "utf8");

  const match = src.match(SCRIPT_RE);
  if (!match) throw new Error(`${page}: no <script type="text/babel"> block found`);
  if (!BABEL_TAG_RE.test(src)) throw new Error(`${page}: no Babel <script src> tag found`);

  const { code } = Babel.transform(match[1], {
    presets: ["react"],
    filename: page,
    sourceMaps: false,
    compact: false,
  });

  // An inline script ends at the first literal </script>, wherever it appears --
  // including inside a string. Fail loudly rather than emit a broken page.
  if (/<\/script/i.test(code)) {
    throw new Error(`${page}: compiled output contains "</script>" and would truncate the page`);
  }

  const out = src
    .replace(BABEL_TAG_RE, "")
    .replace(SCRIPT_RE, () => `<script>\n${code}\n</script>`);

  fs.writeFileSync(file, out);
  before += Buffer.byteLength(match[1]);
  after += Buffer.byteLength(code);
  console.log(
    `  ${page.padEnd(22)} JSX ${(Buffer.byteLength(match[1]) / 1024).toFixed(1)} KB ` +
      `-> JS ${(Buffer.byteLength(code) / 1024).toFixed(1)} KB`
  );
}

// The compiler itself must not ship, and the worker must stop precaching it --
// a SHELL entry that 404s fails install, which would ship an offline-broken app.
const babelPath = path.join(TARGET, BABEL_VENDOR);
const babelBytes = fs.statSync(babelPath).size;
fs.unlinkSync(babelPath);

const swFile = path.join(TARGET, "service-worker.js");
const sw = fs.readFileSync(swFile, "utf8");
const SW_LINE_RE = new RegExp(`[ \\t]*"\\./${BABEL_VENDOR.replace(/[.\-\/]/g, "\\$&")}",?\\r?\\n`);
if (!SW_LINE_RE.test(sw)) throw new Error("service-worker.js: Babel not found in SHELL");
fs.writeFileSync(swFile, sw.replace(SW_LINE_RE, ""));

// Nothing may still point at the compiler after this.
for (const f of fs.readdirSync(TARGET)) {
  if (!f.endsWith(".html") && !f.endsWith(".js")) continue;
  const body = fs.readFileSync(path.join(TARGET, f), "utf8");
  if (body.includes(BABEL_VENDOR)) throw new Error(`${f} still references ${BABEL_VENDOR}`);
}

console.log(
  `  JSX ${(before / 1024).toFixed(1)} KB -> JS ${(after / 1024).toFixed(1)} KB; ` +
    `dropped ${(babelBytes / 1048576).toFixed(2)} MB of compiler and its SHELL entry`
);
