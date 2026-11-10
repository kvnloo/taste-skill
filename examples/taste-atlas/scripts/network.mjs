// LinkedIn network importer: your own "Get a copy of your data" export → $ATLAS_DATA/network.atlas.json for /network.
//   node scripts/network.mjs <Basic_LinkedInDataExport.zip | unzipped folder> [--out data/network.atlas.json]
// No scraping and nothing leaves the machine. Emails, phone numbers and message text are never written out:
// messages only count toward how warm each connection is, and group threads link people who know each other.
//
// What the export can and cannot tell you: LinkedIn exports only your 1st-degree connections. Friends of friends
// come from evidence in your own data: people in a group thread with a connection, and invitations or messages
// from people you are not connected to (each one linked to the connections they share threads with).
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { csvRows } from "./history.mjs";

// Read one CSV from the export, whether zip or folder; LinkedIn prefixes some files with a "Notes:" preamble.
export function reader(src) {
  const zip = statSync(src).isFile();
  return (name) => {
    let text;
    if (zip) { try { text = execFileSync("unzip", ["-p", src, name], { encoding: "utf8", maxBuffer: 1 << 28 }); } catch { return []; } }
    else { const f = join(src, name); if (!existsSync(f)) return []; text = readFileSync(f, "utf8"); }
    const rows = csvRows(text.replace(/^\uFEFF/, "")), at = rows.findIndex((r) => r.length > 2);
    if (at < 0) return [];
    const head = rows[at].map((h) => h.trim());
    return rows.slice(at + 1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  };
}

const slug = (u) => (u ?? "").match(/linkedin\.com\/in\/([^/?#,\s]+)/i)?.[1]?.toLowerCase() ?? null;
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function day(s) {
  if (!s) return null; let m;
  if ((m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2}) (\w{3}) (\d{4})/))) return new Date(Date.UTC(+m[3], MON[m[2].toLowerCase()], +m[1])).toISOString().slice(0, 10);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2])).toISOString().slice(0, 10);
  return null;
}
// "Acme, Inc." and "ACME Inc" are one company.
export const companyKey = (c) => (c ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\b(inc|llc|ltd|corp|corporation|co|plc|gmbh)\b/g, "").replace(/\s+/g, " ").trim();
// Placeholder employers are not a company: 30 people at "Stealth Startup" are not colleagues.
const GENERIC = /^(stealth( mode)?( startup| company| ai startup)?|self[- ]employed|freelance(r)?|confidential|independent( consultant)?|retired|none|n\/?a|unemployed|open to work)$/;
const years = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);

export function buildNetwork(read, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const people = new Map(), person = (s) => people.get(s) ?? people.set(s, { id: `p:${s}`, url: s.startsWith("~") ? null : `https://www.linkedin.com/in/${s}`, msgs: 0, sent: 0, recv: 0, endorse: 0, threads: new Set() }).get(s);
  for (const r of read("Connections.csv")) {
    const s = slug(r.URL) ?? `~${r["First Name"]} ${r["Last Name"]}`.trim().toLowerCase(); if (s === "~") continue; // hidden profiles: no URL, often no name
    Object.assign(person(s), { connected: true, name: `${r["First Name"]} ${r["Last Name"]}`.trim(), company: r.Company || null, position: r.Position || null, since: day(r["Connected On"]) });
  }
  // You are the profile that sends the most messages.
  const msgs = read("messages.csv"), sends = {};
  for (const m of msgs) { const s = slug(m["SENDER PROFILE URL"]); if (s) sends[s] = (sends[s] ?? 0) + 1; }
  const me = Object.entries(sends).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const prof = read("Profile.csv")[0] ?? {};
  const threads = new Map();
  for (const m of msgs) {
    const from = slug(m["SENDER PROFILE URL"]), to = (m["RECIPIENT PROFILE URLS"] ?? "").split(/,\s*/).map(slug).filter(Boolean), d = day(m.DATE);
    const all = [from, ...to].filter((s) => s && s !== me), t = threads.get(m["CONVERSATION ID"]) ?? threads.set(m["CONVERSATION ID"], new Set()).get(m["CONVERSATION ID"]);
    for (const s of all) {
      const p = person(s); t.add(s); p.threads.add(m["CONVERSATION ID"]); p.msgs++;
      if (from === me) p.sent++; else if (s === from) p.recv++;
      if (s === from && !p.name) p.name = m.FROM;
      if (d && (!p.last || d > p.last)) p.last = d;
    }
  }
  for (const [f, k] of [["Endorsement_Received_Info.csv", "Endorser"], ["Endorsement_Given_Info.csv", "Endorsee"]])
    for (const r of read(f)) { const s = slug(r[`${k} Public Url`]); if (s && s !== me) { const p = person(s); p.endorse++; p.name ??= `${r[`${k} First Name`]} ${r[`${k} Last Name`]}`.trim(); } }
  for (const r of read("Invitations.csv")) {
    const inn = r.Direction === "INCOMING", s = slug(inn ? r.inviterProfileUrl : r.inviteeProfileUrl); if (!s || s === me) continue;
    const p = person(s); p.name ??= inn ? r.From : r.To; p.invited = inn ? "them" : "you"; p.inviteNote = !!r.Message;
  }
  // Warmth: how likely this person answers an intro ask. Two-way conversation and recency dominate; a connection
  // you never talked to still counts a little.
  for (const p of people.values()) {
    const age = p.last ? years(p.last, today) : 99;
    p.warmth = +((p.connected ? 1 : 0) + 2 * Math.log2(1 + p.msgs) + (p.sent && p.recv ? 2 : 0) + 1.5 * p.endorse + (p.inviteNote ? 0.5 : 0) + (age < 1 ? 2 : age < 3 ? 1 : 0)).toFixed(2);
  }
  // Companies you worked at mark subject-matter overlap: your colleagues there are your strongest intros.
  const mine = new Map(read("Positions.csv").map((r) => [companyKey(r["Company Name"]), r]));
  const companies = new Map();
  for (const p of people.values()) {
    if (!p.connected || !p.company) continue;
    const k = companyKey(p.company); if (!k || GENERIC.test(k)) continue;
    const c = companies.get(k) ?? companies.set(k, { id: `c:${k}`, name: p.company, people: [], mine: mine.has(k) ? mine.get(k).Title || true : false }).get(k);
    c.people.push(p.id); p.ck = k;
  }
  const byId = new Map([...people.values()].map((p) => [p.id, p]));
  for (const c of companies.values()) {
    c.people.sort((a, b) => byId.get(b).warmth - byId.get(a).warmth);
    // Reach: the best intro plus diminishing credit for more people there.
    c.reach = +(c.people.reduce((a, id, i) => a + byId.get(id).warmth / (i + 1), 0)).toFixed(2);
  }
  // Friends of friends: non-connections who share a thread with a connection.
  const edges = [], seen = new Set(), edge = (s, t, type, w = 1) => { const k = s < t ? `${s}|${t}` : `${t}|${s}`; if (seen.has(k + type)) return; seen.add(k + type); edges.push({ s, t, type, w }); };
  const nodes = [{ id: "me", type: "me", label: prof["First Name"] ? `${prof["First Name"]} ${prof["Last Name"]}`.trim() : "You", url: me ? `https://www.linkedin.com/in/${me}` : null, headline: prof.Headline || null }];
  for (const c of companies.values()) if (c.people.length > 1 || c.mine) nodes.push({ id: c.id, type: "company", label: c.name, n: c.people.length, reach: c.reach, mine: c.mine, best: c.people.slice(0, 8) });
  const hub = (k) => { const c = companies.get(k); return c && (c.people.length > 1 || c.mine) ? c.id : null; };
  for (const [s, p] of people) {
    const via = new Set();
    for (const t of p.threads) for (const s of threads.get(t)) { const q = people.get(s); if (q !== p && q.connected) via.add(q.id); }
    if (!p.connected && !via.size && p.invited !== "them") continue; // a stranger with no tie into your network
    const node = { id: p.id, type: p.connected ? "person" : "fof", label: p.name || s, url: p.url, company: p.company ?? null, position: p.position ?? null,
      since: p.since ?? null, last: p.last ?? null, msgs: p.msgs, twoWay: !!(p.sent && p.recv), endorse: p.endorse, invited: p.invited ?? null, warmth: p.warmth };
    if (!p.connected) node.via = [...via].sort((a, b) => byId.get(b).warmth - byId.get(a).warmth).slice(0, 8);
    nodes.push(node);
    if (p.connected) { edge("me", p.id, "knows", p.warmth); const h = p.ck && hub(p.ck); if (h) edge(p.id, h, "works"); }
    for (const v of via) edge(p.id, v, "together");
  }
  const conn = nodes.filter((n) => n.type === "person");
  return { kind: "taste-atlas.network.v1", generated: today, me: nodes[0].label,
    stats: { connections: conn.length, companies: companies.size, hubs: nodes.filter((n) => n.type === "company").length, fof: nodes.filter((n) => n.type === "fof").length, talkedTo: conn.filter((n) => n.msgs).length, threads: threads.size },
    nodes, edges };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2), src = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
  if (!src || !existsSync(src)) { console.error("usage: node scripts/network.mjs <Basic_LinkedInDataExport.zip|folder> [--out data/network.atlas.json]"); process.exit(2); }
  const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(process.env.ATLAS_DATA ?? join(app, "data"), "network.atlas.json");
  const g = buildNetwork(reader(src));
  if (!g.stats.connections) { console.error(`${src}: no Connections.csv rows; is this a LinkedIn data export?`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(g));
  console.log(JSON.stringify({ out, ...g.stats, nodes: g.nodes.length, edges: g.edges.length }));
}
