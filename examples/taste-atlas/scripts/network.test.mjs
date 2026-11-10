// node --test scripts/network.test.mjs — the LinkedIn export importer, on a fixture shaped like the real export.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildNetwork, reader, day, companyKey } from "./network.mjs";

const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "network-"));
const put = (name, rows) => writeFileSync(join(dir, name), rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"));
const u = (s) => `https://www.linkedin.com/in/${s}`;
put("Connections.csv", [["Notes:"], ["When exporting your connection data, you may notice that some of the email addresses are missing."], [],
  ["First Name", "Last Name", "URL", "Email Address", "Company", "Position", "Connected On"],
  ["Ada", "Warm", u("ada"), "ada@example.com", "Acme, Inc.", "Engineer", "15 Aug 2024"],
  ["Bob", "Cold", u("bob"), "", "ACME Inc", "PM", "01 Jan 2019"],
  ["Cy", "Stealth", u("cy"), "", "Stealth Startup", "Founder", "01 Jan 2020"],
  ["Dee", "Alum", u("dee"), "", "OldCo", "Lead", "01 Jan 2021"],
  ["", "", "", "", "", "", "01 Jan 2021"]]);
put("messages.csv", [["CONVERSATION ID", "CONVERSATION TITLE", "FROM", "SENDER PROFILE URL", "TO", "RECIPIENT PROFILE URLS", "DATE", "SUBJECT", "CONTENT", "FOLDER", "ATTACHMENTS"],
  ["t1", "", "Me", u("me"), "Ada Warm", u("ada"), "2026-08-01 10:00:00 UTC", "", "secret text", "INBOX", ""],
  ["t1", "", "Ada Warm", u("ada"), "Me", u("me"), "2026-08-02 10:00:00 UTC", "", "secret reply", "INBOX", ""],
  ["t1", "", "Me", u("me"), "Ada Warm", u("ada"), "2026-08-03 10:00:00 UTC", "", "", "INBOX", ""],
  ["t2", "group", "Me", u("me"), "Ada Warm, Fay Friend", `${u("ada")},${u("fay")}`, "2026-07-01 10:00:00 UTC", "", "", "INBOX", ""]]);
put("Endorsement_Received_Info.csv", [["Endorsement Date", "Skill Name", "Endorser First Name", "Endorser Last Name", "Endorser Public Url", "Endorsement Status"],
  ["2026/06/14 16:57:04 UTC", "Python", "Dee", "Alum", "www.linkedin.com/in/dee", "ACCEPTED"]]);
put("Invitations.csv", [["From", "To", "Sent At", "Message", "Direction", "inviterProfileUrl", "inviteeProfileUrl"],
  ["Gil New", "Me", "8/11/26, 10:06 PM", "Hi!", "INCOMING", u("gil"), u("me")],
  ["Me", "Hal Ghost", "8/11/26, 10:06 PM", "", "OUTGOING", u("me"), u("hal")]]);
put("Positions.csv", [["Company Name", "Title", "Description", "Location", "Started On", "Finished On"], ["OldCo", "Engineer", "", "", "Jan 2020", "Jan 2022"]]);
put("Profile.csv", [["First Name", "Last Name", "Headline"], ["Me", "Myself", "Builder"]]);

const g = buildNetwork(reader(dir), { today: "2026-11-10" }), by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));

test("connections, companies and you; hidden profiles with no URL or name drop", () => {
  assert.equal(g.stats.connections, 4);
  assert.equal(by.me.label, "Me Myself"); assert.equal(by.me.url, u("me"));
  assert.equal(by["c:acme"].n, 2, "Acme, Inc. and ACME Inc are one company");
  assert.deepEqual(by["c:acme"].best, ["p:ada", "p:bob"], "warmest first");
});

test("warmth: two-way recent messages beat a bare connection; endorsements count", () => {
  assert.ok(by["p:ada"].warmth > by["p:dee"].warmth && by["p:dee"].warmth > by["p:bob"].warmth);
  assert.equal(by["p:ada"].msgs, 4); assert.equal(by["p:ada"].twoWay, true); assert.equal(by["p:ada"].last, "2026-08-03");
  assert.equal(by["p:bob"].warmth, 1);
});

test("placeholder employers are not hubs; companies you worked at are", () => {
  assert.equal(by["c:stealth startup"], undefined);
  assert.equal(by["c:oldco"].mine, "Engineer"); assert.equal(by["c:oldco"].n, 1);
});

test("friends of friends: a group-thread member you are not connected to links through the connection", () => {
  assert.equal(by["p:fay"].type, "fof"); assert.deepEqual(by["p:fay"].via, ["p:ada"]);
  assert.ok(g.edges.some((e) => e.type === "together" && [e.s, e.t].sort().join() === "p:ada,p:fay"));
  assert.equal(by["p:gil"].invited, "them", "a pending invitation to you is kept");
  assert.equal(by["p:hal"], undefined, "an unanswered invite you sent, with no shared thread, is not a tie");
});

test("never writes emails or message text", () => {
  const s = JSON.stringify(g);
  assert.ok(!s.includes("example.com") && !s.includes("secret"));
});

test("date formats in the export", () => {
  assert.equal(day("15 Aug 2024"), "2024-08-15"); assert.equal(day("2026/06/14 16:57:04 UTC"), "2026-06-14");
  assert.equal(day("8/11/26, 10:06 PM"), "2026-08-11"); assert.equal(companyKey("Acme, Inc."), "acme");
});
