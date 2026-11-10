// Talk to the board: one Hermes session per board over ACP (Agent Client Protocol, JSON-RPC on `hermes acp` stdio).
// What you say or type on the board page becomes a prompt; Hermes answers on the board and drives it with board.mjs
// (search, focus, compare, push, design...). Dangerous-command permission requests are always denied: the board page
// is reachable by anyone on the tailnet, so it must never be a way to approve shell commands.
// $TASTE_AGENT=off disables it; $TASTE_AGENT_CMD overrides the command (default `hermes acp --accept-hooks`).
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

// Hermes' terminal tool does not inherit this process's env, so the board home/URL ride in the command itself;
// without them board.mjs falls back to ~/.cache/taste-board and a scratch server would drive the live boards.
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const envs = ["TASTE_BOARD_HOME", "TASTE_BOARD_URL", "TASTE_PENCIL_URL", "TASTE_OPENPENCIL"].filter((k) => process.env[k]).map((k) => `${k}=${q(process.env[k])}`);
const CLI = [...envs, "node", fileURLToPath(new URL("./board.mjs", import.meta.url))].join(" ");
const IDLE_MS = 30 * 60e3;
const agents = new Map();  // board id -> Agent

export const agentEnabled = () => (process.env.TASTE_AGENT ?? "hermes") !== "off";

function brief(id, url) {
  return `You are the design partner on Kevin's live Taste board "${id}" (${url}). He is talking to you from the board page,
often by voice, so his words may be loose transcripts. Keep replies to one or two short spoken-style sentences; they
appear on the board as your notes. Act through the board CLI with your terminal tool, never by editing files:
  ${CLI} status ${id}                 board, every ref (id, title, source, technique) and his picks
  ${CLI} search ${id} "<query>" [--from mine,portfolio,dribbble,behance,mobbin,web] [--n 6]
  ${CLI} focus ${id} <refId...> --why "<criterion>"    show only these (filter); focus ${id} clear
  ${CLI} compare ${id} <refIdA> <refIdB> --why "<what differs>"   side by side, he picks; compare ${id} clear
  ${CLI} techniques ${id} "<request>" | push ${id} '<json>' | ref ${id} <urls...>
  ${CLI} design ${id}                 kept refs + direction -> editable OpenPencil/Figma file, returns the edit link
How to help him choose (his own process): narrow by what he says (focus), then put two real candidates side by side and
ask one concrete question (compare); his like/pin/nope clicks are the truth, read them with status before each move.
Run the CLI exactly as written above (the env prefix selects his board store). Never mark something approved he did not
pick. Do not post or push anything anywhere else.`;
}

class Agent {
  constructor(id, onEvent) {
    this.id = id; this.onEvent = onEvent; this.next = 1; this.wait = new Map(); this.queue = Promise.resolve(); this.text = "";
    const [bin, ...args] = (process.env.TASTE_AGENT_CMD ?? "hermes acp --accept-hooks").split(" ");
    this.p = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    this.p.on("error", (e) => this.fail(`agent did not start: ${e.message}`));
    this.p.on("exit", (code, sig) => this.fail(`agent exited (${sig ?? code})`));
    this.p.stderr.on("data", (c) => process.stderr.write(`[agent ${id}] ${c}`));
    createInterface({ input: this.p.stdout }).on("line", (l) => this.line(l));
    this.ready = this.rpc("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
      .then(() => this.rpc("session/new", { cwd: process.cwd(), mcpServers: [] })).then((r) => { this.session = r.sessionId; });
    this.touch();
  }
  touch() { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), IDLE_MS); }
  stop() { clearTimeout(this.idle); agents.delete(this.id); this.p.kill(); }
  fail(msg) {
    if (this.dead) return; this.dead = true; agents.delete(this.id); clearTimeout(this.idle);
    for (const w of this.wait.values()) w.reject(new Error(msg));
    this.onEvent({ type: "error", text: msg });
  }
  send(m) { this.p.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n"); }
  rpc(method, params) { const id = this.next++; this.send({ id, method, params }); return new Promise((resolve, reject) => this.wait.set(id, { resolve, reject })); }
  line(l) {
    let m; try { m = JSON.parse(l); } catch { process.stderr.write(`[agent ${this.id}] non-JSON: ${l.slice(0, 200)}\n`); return; }
    if (m.id != null && !m.method) {  // response to us
      const w = this.wait.get(m.id); this.wait.delete(m.id);
      return m.error ? w?.reject(new Error(m.error.message ?? JSON.stringify(m.error))) : w?.resolve(m.result);
    }
    if (m.method === "session/request_permission") {
      this.onEvent({ type: "step", text: `denied: ${m.params?.toolCall?.title ?? "a command needing approval"}` });
      const deny = m.params?.options?.find((o) => o.kind?.startsWith("reject"));
      return this.send({ id: m.id, result: { outcome: deny ? { outcome: "selected", optionId: deny.optionId } : { outcome: "cancelled" } } });
    }
    if (m.id != null) return this.send({ id: m.id, error: { code: -32601, message: `client does not support ${m.method}` } });
    if (m.method !== "session/update") return;
    const u = m.params.update;
    if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") this.text += u.content.text;
    else if (u.sessionUpdate === "tool_call") this.onEvent({ type: "step", text: u.title ?? u.kind ?? "working" });
  }
  say(text, url) {
    this.touch();
    const turn = this.queue.then(async () => {
      await this.ready;
      const prompt = this.briefed ? text : `${brief(this.id, url)}\n\nKevin: ${text}`; this.briefed = true;
      this.text = ""; this.onEvent({ type: "busy" });
      const r = await this.rpc("session/prompt", { sessionId: this.session, prompt: [{ type: "text", text: prompt }] });
      this.onEvent({ type: "reply", text: this.text.trim(), stop: r?.stopReason });
    });
    this.queue = turn.catch(() => {});
    return turn;
  }
}

/** Send what the owner said to this board's agent; events: busy | step | reply | error. */
export function talk(id, text, url, onEvent) {
  let a = agents.get(id);
  if (!a || a.dead) { a = new Agent(id, onEvent); agents.set(id, a); }
  a.onEvent = onEvent;
  return a.say(text, url).catch((e) => onEvent({ type: "error", text: e.message }));
}
