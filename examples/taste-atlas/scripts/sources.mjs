#!/usr/bin/env node
// Build the "sources" layer: things you asked an agent to recreate, films you made, and your own GitHub
// projects and ideas. Each item is placed on a technique (best text match) and shows beside your bookmarks.
//   node scripts/sources.mjs [--asks asks.jsonl] [--films films.jsonl] [--projects projects.json] [--labels labels.jsonl]
// --labels: {id, techniques:[...], seen} per line, e.g. from taste/scripts/label_bookmarks_teacher.py run on these
// items. Unlabelled items stay off the graph and list under "All" in the shelf; keyword matching was tried and is noise.
// Writes $ATLAS_DATA/sources.atlas.json (default ../data, gitignored) and thumbnails into data/thumbs/.
// Inputs, all optional, one JSON object per line for .jsonl:
//   asks:     {url, text, date}            a link plus what you asked about it (X posts get media via fxtwitter)
//   films:    {id, url, title, text, thumb_file, date}
//   projects: {"github": "<user>", "repos": 12, "only"?: [names, forks allowed], "ideas": [{"title", "text", "url"?, "image"?}]}  see sources.example.json
// reuse-checked: scripts/atlas.mjs -- agent CLI over the taxonomy; this only builds data. bookmark sync -- X saves only.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = process.env.ATLAS_DATA ?? join(here, "../data");
const argv = process.argv.slice(2), arg = (f) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : null);
const lines = (f) => (f && existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
mkdirSync(join(data, "thumbs"), { recursive: true });
const labels = new Map(lines(arg("--labels")).map((l) => [l.id, l]));

async function json(url, headers = {}) {
  const r = await fetch(url, { headers: { "user-agent": "taste-atlas", ...headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
async function save(url, name) {
  const file = join(data, "thumbs", name);
  if (existsSync(file)) return `thumbs/${name}`;
  try { const r = await fetch(url); if (!r.ok) return null; writeFileSync(file, Buffer.from(await r.arrayBuffer())); return `thumbs/${name}`; } catch { return null; }
}
function place(item, layer) {
  const l = labels.get(item.id), [a, b] = l?.techniques ?? [];
  return { ...item, layer, technique: a ?? null, also: b ?? null, seen: l?.seen ?? null, labeller: l ? l.labeller ?? "teacher" : null };
}

async function asks() {
  const out = [];
  for (const a of lines(arg("--asks"))) {
    const m = a.url.match(/(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/);
    let item = { id: `ask-${m?.[2] ?? Buffer.from(a.url).toString("base64url").slice(-16)}`, url: a.url, author: m?.[1] ?? new URL(a.url).hostname.replace(/^www\./, ""), text: a.text || "(sent without a note)", date: a.date, type: "link" };
    if (m) try {
      const t = (await json(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`)).tweet, med = t.media?.all?.[0];
      item = { ...item, author: t.author.screen_name, post: t.text, type: med?.type === "gif" ? "animated_gif" : med?.type ?? "text", likes: t.likes };
      if (med?.type === "video" || med?.type === "gif") item.video = med.url;
      const img = med?.thumbnail_url ?? (med?.type === "photo" ? med.url : null);
      if (img) item.thumb = await save(img, `${item.id}.jpg`);
    } catch (e) { process.stderr.write(`fxtwitter: ${e.message}\n`); }
    out.push(place(item, "ask"));
  }
  return out;
}

function films() {
  return lines(arg("--films")).map((f) => {
    let thumb = null;
    if (f.thumb_file && existsSync(f.thumb_file)) { const n = `${f.id}${extname(f.thumb_file)}`; copyFileSync(f.thumb_file, join(data, "thumbs", n)); thumb = `thumbs/${n}`; }
    return place({ id: f.id, url: f.url, title: f.title, author: f.author || "you", text: `${f.title}. ${f.text ?? ""}`.trim(), date: f.date, type: "video", thumb }, "film");
  });
}

async function projects() {
  const f = arg("--projects"); if (!f || !existsSync(f)) return [];
  const p = JSON.parse(readFileSync(f, "utf8")), out = [];
  if (p.github) {
    const auth = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
    const repos = (await json(`https://api.github.com/users/${p.github}/repos?sort=pushed&per_page=100`, auth))
      .filter((r) => !r.private && (p.only ? p.only.includes(r.name) : !r.fork)).slice(0, p.repos ?? 12);
    for (const r of repos) out.push(place({
      id: `gh-${r.id}`, url: r.html_url, title: r.name, author: p.github, date: r.pushed_at?.slice(0, 10), type: "repo", likes: r.stargazers_count,
      text: `${r.name}${r.description ? ` — ${r.description}` : ""}${r.topics?.length ? ` (${r.topics.join(", ")})` : ""}`,
      thumb: await save(`https://opengraph.githubassets.com/1/${r.full_name}`, `gh-${r.id}.png`),
    }, "project"));
  }
  for (const [i, idea] of (p.ideas ?? []).entries()) out.push(place({
    id: `idea-${i}`, url: idea.url ?? "", title: idea.title, author: p.github ?? "you", text: `${idea.title}. ${idea.text ?? ""}`, type: "idea",
    thumb: idea.image ? await save(idea.image, `idea-${i}${extname(new URL(idea.image).pathname) || ".jpg"}`) : null,
  }, "idea"));
  return out;
}

const items = [...(await asks()), ...films(), ...(await projects())];
const out = join(data, "sources.atlas.json");
writeFileSync(out, JSON.stringify({ kind: "taste-atlas.sources.v1", method: labels.size ? "teacher labels (image + text)" : "unlabelled", count: items.length, items }, null, 1));
const by = items.reduce((m, i) => ((m[i.layer] = (m[i.layer] ?? 0) + 1), m), {});
console.log(JSON.stringify({ out, ...by, with_thumb: items.filter((i) => i.thumb).length, placed: items.filter((i) => i.technique).length }));
