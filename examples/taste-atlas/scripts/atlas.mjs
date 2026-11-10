#!/usr/bin/env node
// Agent CLI for the Taste Atlas. JSON on stdout (--md for markdown briefs). No dependencies.
//   node atlas.mjs export                       taxonomy (operations, domains, techniques with web recipes)
//   node atlas.mjs list [--op evoke]            techniques
//   node atlas.mjs get <id>                     one technique (+ your bookmarks as references, if data is present)
//   node atlas.mjs search <words>               techniques and bookmarks matching words
//   node atlas.mjs suggest "<request>"          techniques that fit a free-text design request
//   node atlas.mjs brief <id...> [--component] [--md]   build brief for a site (default) or a UI component
// ids: technique (closure), specimen (closure--2), domain (infer/grouping) or operation (infer).
// Bookmarks and sources: $ATLAS_DATA/{bookmarks,sources}.atlas.json (default ../data). Private; never commit them.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TECHNIQUES } from "../src/taxonomy.js";
import { brief, briefMarkdown, suggest, taxonomyExport, techniqueRecord, techniquesFor } from "../src/brief.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.ATLAS_DATA ?? join(here, "../data");
const load = (f) => (existsSync(join(dataDir, f)) ? JSON.parse(readFileSync(join(dataDir, f), "utf8")).items.filter((b) => b.technique) : []);
// sources.atlas.json (scripts/sources.mjs): asks, films, projects and ideas, placed on techniques the same way.
const rows = [...load("bookmarks.atlas.json"), ...load("sources.atlas.json")];
const refsFor = (id) => rows.filter((b) => b.technique === id).sort((a, b) => !a.thumb - !b.thumb || (b.score ?? 0) - (a.score ?? 0));

const [cmd, ...rest] = process.argv.slice(2);
const flag = (f) => rest.includes(f), args = rest.filter((a) => !a.startsWith("--") && rest[rest.indexOf(a) - 1] !== "--op");
const print = (v) => process.stdout.write((typeof v === "string" ? v : JSON.stringify(v, null, 2)) + "\n");
const fail = (m) => { process.stderr.write(m + "\n"); process.exit(2); };

switch (cmd) {
  case "export": print(taxonomyExport()); break;
  case "list": { const op = rest[rest.indexOf("--op") + 1]; print(TECHNIQUES.filter((t) => !flag("--op") || t.op === op).map((t) => ({ id: t.id, name: t.name, op: t.op, mechanism: t.mech, refs: refsFor(t.id).length }))); break; }
  case "get": { const ts = techniquesFor(args[0] ?? ""); if (!ts.length) fail(`unknown id: ${args[0]}`); print(ts.map((t) => techniqueRecord(t, refsFor(t.id).slice(0, 12)))); break; }
  case "search": {
    const q = args.join(" ").toLowerCase(); if (!q) fail("search needs words");
    print({ techniques: TECHNIQUES.filter((t) => `${t.name} ${t.mech} ${t.ui}`.toLowerCase().includes(q)).map((t) => t.id),
      bookmarks: rows.filter((b) => `${b.text} ${b.author}`.toLowerCase().includes(q)).slice(0, 20).map((b) => ({ url: b.url, technique: b.technique, text: b.text.slice(0, 120) })) });
    break;
  }
  case "suggest": print(suggest(args.join(" "))); break;
  case "brief": {
    if (!args.length) fail("brief needs one or more ids");
    const b = brief(args, { refsFor, target: flag("--component") ? "component" : "site" });
    if (!b.techniques.length) fail(`no techniques for: ${args.join(" ")}`);
    print(flag("--md") ? briefMarkdown(b) : b); break;
  }
  default: fail(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 10).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
