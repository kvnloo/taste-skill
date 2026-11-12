"""Synthetic, public-safe mission.example.json: a fictional launch day ("Murmur" voice notes) in the same schema as
build.py's real snapshot. No real asks, session ids, PR urls or media; thumbs are inline SVG."""
import json, random, sys, base64

R = random.Random(7)
OUT = sys.argv[1]
DAY0, NOW, DEADLINE = 150, 1095, 960

def svg(label, hue, sub=""):
    s = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><defs><radialGradient id="g" cx=".3" cy=".35" r=".9"><stop offset="0" stop-color="hsl({hue},70%,58%)"/><stop offset="1" stop-color="hsl({(hue+40)%360},45%,12%)"/></radialGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="250" cy="70" r="34" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><text x="18" y="148" font-family="Helvetica,Arial" font-weight="700" font-size="24" fill="#fff">{label}</text><text x="18" y="168" font-family="Menlo,monospace" font-size="12" fill="#fff" fill-opacity=".7">{sub}</text></svg>'''
    return "data:image/svg+xml;base64," + base64.b64encode(s.encode()).decode()

streams = [
    {"id": "film", "name": "Launch film", "color": "#e8a33d", "theme": "One ask, carried to done"},
    {"id": "app", "name": "Murmur app", "color": "#6fb3ff", "theme": "Make the record button feel alive"},
    {"id": "cards", "name": "UI cards", "color": "#c58cff", "theme": "Real components, not screenshots"},
    {"id": "site", "name": "Landing page", "color": "#ff7a9c", "theme": "One page, one promise"},
    {"id": "sound", "name": "Music", "color": "#4fd1a5", "theme": "Bright, clean, on the beat"},
    {"id": "ship", "name": "Submission & post", "color": "#f2d16b", "theme": "Get it in front of people"},
    {"id": "ops", "name": "Side quests", "color": "#8f8a80", "theme": "Machine, memory, quotas"},
]
names = ["Cold open", "Say it once", "It listens", "Notes sort themselves", "Ask a question", "Share a clip", "Reviewed before send",
         "Team space", "Search by voice", "Your theme", "Offline first", "Pricing", "End card"]
states = ["live", "live", "still", "live", "at-risk", "live", "still", "live", "live", "still", "live", "at-risk", "live"]
scenes, t = [], 0.0
for i, n in enumerate(names):
    d = round(R.uniform(5, 8.5), 1)
    hue = (i * 27 + 20) % 360
    scenes.append({"id": f"s{i}", "name": n, "t0": round(t, 1), "t1": round(t + d, 1), "thumb": svg(n, hue, f"S{i}"), "state": states[i],
                   "note": R.choice(["Live take from the real app", "Still frame, needs a live take", "Card renders from the component", "Waiting on a re-record"]),
                   "work": [svg(f"{n} · wip {k + 1}", hue + 15 * k, "draft") for k in range(2)]})
    t += d

asks = {
    "film": ["Cut the launch film: 3 directions", "Pick a direction, full cut", "Storyboard pass: every shot real", "Re-record the payoff", "Beat-sync the cut to the track", "Sanity check the final cut", "Fix captions + safe area"],
    "app": ["Record button breathes with voice level", "Thinking state: cycle modes on the beat", "Share sheet with clip preview", "Theme follows wallpaper", "Offline queue for notes", "Fix: waveform drops frames", "Search by voice, first pass", "Prove it in a real window"],
    "cards": ["Note card: summary + tags", "Review card: approve before send", "Team space card", "Pricing card from the plan table", "Audit: replace screenshots with cards"],
    "site": ["Landing hero with the film", "Pricing section", "OG image + meta"],
    "sound": ["Find 5 bright tracks", "Pick one, cut to 88s"],
    "ship": ["Draft the post", "Submission form + video upload", "Rewrite post for attention"],
    "ops": ["Why is the build box slow", "Clean old worktrees", "Quota check before the push"],
}
tools = ["terminal", "read_file", "patch", "browser", "vision_analyze", "write_file"]
sessions, prs, events, pn = [], [], [], 300
starts = {"film": 560, "app": 470, "cards": 840, "site": 900, "sound": 880, "ship": 780, "ops": 600}
for st, lst in asks.items():
    t0 = starts[st]
    for k, label in enumerate(lst):
        start = round(t0 + R.uniform(0, 30), 2)
        length = R.uniform(14, 95)
        end = round(min(start + length, NOW), 2)
        t0 = start + R.uniform(18, 70)
        if start > NOW - 20: start = NOW - R.uniform(25, 60); end = NOW
        sid = f"demo-{st}-{k}"
        outcome = "running" if end >= NOW - 1 else R.choice(["done"] * 7 + ["failed"])
        sc = [] if st in ("ops", "sound", "site") else R.sample([c["id"] for c in scenes], R.randint(1, 3))
        nb = max(1, int((end - start) // 5) + 1)
        spark = [R.randint(1, 14) for _ in range(nb)]
        my_prs = []
        if st in ("app", "cards", "site") and R.random() < 0.7:
            pn += 1; pt = round(R.uniform(start + 5, end), 2)
            prs.append({"n": pn, "title": f"feat({st}): {label.lower()}", "state": "MERGED" if outcome != "running" else "OPEN", "t": pt, "url": f"https://example.com/murmur/pull/{pn}", "session": sid})
            my_prs.append(pn)
        steps = [{"t": round(start + (end - start) * f, 2), "say": s} for f, s in ((0.1, f"Reading the repo for: {label.lower()}."), (0.6, "Change made; running the real app to check it."), (0.98, "Verified in a real window, screenshot attached." if outcome == "done" else "Still working: next is the visual check."))]
        sessions.append({"id": sid, "stream": st, "label": label, "title": label, "scenes": sc, "outcome": outcome,
                         "clauses": label.lower().replace(":", "").split(", ")[:1] + (["shipped in the app"] if st == "app" else ["real, not mocked"]),
                         "prs": my_prs, "start": start, "end": end, "subagent": R.random() < 0.3, "ask": f"{label}. Show me the real thing when it works.",
                         "owner_msgs": [{"t": start, "text": f"{label}."}, {"t": round((start + end) / 2, 2), "text": R.choice(["closer, but make it feel alive", "this is still a screenshot", "good, ship it", "check it in a real window"])}],
                         "tool_calls": sum(spark), "handoffs": 1 if end - start > 75 else 0, "spark": spark, "spark0": int(start // 5 * 5),
                         "tools": [[x, R.randint(1, 30)] for x in R.sample(tools, 3)], "latest": steps[-1]["say"], "steps": steps, "msgs": R.randint(20, 240),
                         "profile": "clean", "curated": False, "continues": None})
        # synthetic cost accounting (minutes by activity), the shape build.py derives from tool-call timings
        L = end - start; act = round(L * R.uniform(0.35, 0.7), 1)
        mix = {"film": {"probe": 0.12, "vision": 0.1, "encode": 0.06, "wait": 0.08}, "app": {"test": 0.12, "build": 0.08, "capture": 0.06, "ci": 0.06}}.get(st, {"shell": 0.15, "wait": 0.05})
        sessions[-1].update({"active": act, "cost": {k: round(act * f * R.uniform(0.6, 1.4), 1) for k, f in mix.items()}, "ownerWait": round(L * R.uniform(0.1, 0.4), 1),
                             "reorient": round(R.uniform(4, 14), 1) if sessions[-1]["handoffs"] else 0})
        events.append({"t": start, "type": "spawn", "session": sid})
        events.append({"t": round((start + end) / 2, 2), "type": "steer", "session": sid, "text": sessions[-1]["owner_msgs"][1]["text"]})
        for s_ in steps[:-1]: events.append({"t": s_["t"], "type": "progress", "session": sid, "text": s_["say"]})
        for c in sc: events.append({"t": round(R.uniform(start, end), 2), "type": "scene", "session": sid, "scene": c})
        for n in my_prs: events.append({"t": next(p["t"] for p in prs if p["n"] == n), "type": "pr", "pr": n, "session": sid})
        if outcome != "running": events.append({"t": end, "type": "end", "session": sid, "outcome": outcome})
dup = [sessions[2]["id"], sessions[9]["id"]]
for d in dup: next(s for s in sessions if s["id"] == d)["outcome"] = "duplicate"
versions = []
for i, (vt, lab) in enumerate([(700, "Three directions side by side"), (790, "Direction B, rough"), (850, "Full cut v1"), (905, "Live takes swapped in"), (948, "Submitted cut"), (1010, "Captions + safe area"), (1060, "Final")]):
    vid = f"v{i + 1}" if i < 6 else "final"; sc = R.sample([c["id"] for c in scenes], R.randint(1, 4))
    versions.append({"id": vid, "t": vt, "label": lab, "scenes": sc}); events.append({"t": vt, "type": "version", "version": vid})
    for c in sc: events.append({"t": vt, "type": "scene", "scene": c, "version": vid})
# render passes: film chats render in chunks; most passes re-run before any new owner feedback
renders, npass = [], 0
for s in sessions:
    if s["stream"] != "film": continue
    t = s["start"] + 8
    while t < s["end"] - 4:
        npass += 1; reviewed = R.random() < 0.35; chunks = R.choice([1, 6])
        for c in range(chunks):
            d = round(0.8 / chunks * R.uniform(0.9, 1.2), 2); fr = 5280 // chunks
            renders.append({"t": round(t, 2), "d": d, "session": s["id"], "reviewed": reviewed, "frames": fr if R.random() > 0.08 else fr // 3, "total": fr, "finished": True, "pass": npass, "concurrent": 0})
            t += d
        renders[-1]["finished"] = renders[-1]["frames"] == renders[-1]["total"]
        t += R.uniform(6, 16)
    s["renders"] = sum(1 for r in renders if r["session"] == s["id"])
for r in renders: events.append({"t": r["t"], "type": "render", "session": r["session"], "reviewed": r["reviewed"], "d": r["d"]})
commits = [{"repo": R.choice(["app", "site", "film"]), "h": f"{R.getrandbits(28):07x}", "t": round(R.uniform(480, NOW), 2), "s": R.choice(["fix: waveform frame drops", "feat: share sheet preview", "film: swap live take", "chore: bump deps"])} for _ in range(18)]
events.sort(key=lambda e: e["t"])
touch = {}
for s in sessions:
    for c in s["scenes"]: touch[c] = touch.get(c, 0) + 1
data = {
    "generatedAt": "2026-01-15T18:15:00", "sample": True,
    "mission": {"id": "murmur-launch", "title": "Murmur · launch day", "goal": "Ship a <90 s launch film where every shot is the real app",
                "ask": "Make the record button feel alive, and show it in the film by four.", "deadline": DEADLINE, "now": NOW, "dayStart": DAY0, "epoch": "2026-01-15", "today": 0, "projectStart": DAY0,
                "acceptance": ["Film < 90 s, beat-synced", "Every shot is the real app or a real card", "Everything shown ships", "Post + form in by 16:00", "Only sample data on screen"],
                "acceptanceAt": [[None, 1060], [905, None], [DAY0, None], [None, 962], [None, DAY0]],
                "milestones": [{"t": 480, "label": "Build green"}, {"t": 700, "label": "3 film directions"}, {"t": 850, "label": "Full cut"}, {"t": 960, "label": "Deadline", "hard": True}, {"t": 963, "label": "Posted"}, {"t": 1022, "label": "Edit window closes", "hard": True}],
                "film": {"src": "", "duration": round(t, 1), "name": "murmur-launch (sample, no video)"}},
    "streams": streams, "scenes": scenes,
    "ideas": [{"id": "i1", "stream": "film", "text": "Vertical 20s cut for social", "kind": "next"}, {"id": "i2", "stream": "app", "text": "Wallpaper drives the whole theme", "kind": "idea"},
              {"id": "i3", "stream": "cards", "text": "Digest = held notes collapsing into one card", "kind": "idea"}, {"id": "i4", "stream": "film", "text": "Anything the film shows must ship", "kind": "rule"},
              {"id": "i5", "stream": "site", "text": "Autoplay the film muted above the fold", "kind": "idea"}, {"id": "i6", "stream": "ship", "text": "Lead the post with the payoff shot", "kind": "next"}],
    "versions": versions, "sessions": sessions, "prs": prs, "events": events, "renders": renders, "fullCut": 5280, "commits": commits,
    "insights": {"duplicates": [{"session": d, "label": next(s["label"] for s in sessions if s["id"] == d) + " (same ask, second chat)"} for d in dup],
                 "churn": [{"scene": c, "sessions": n} for c, n in sorted(touch.items(), key=lambda x: -x[1])[:4]],
                 "recurring": [{"name": "Proved in a mock, not the real app", "count": 4, "sessions": [s["id"] for s in sessions if s["stream"] == "app"][:4], "fix": "gate: real-window capture or no merge"},
                               {"name": "Screenshot where a real card should be", "count": 3, "scenes": ["s4", "s11"], "sessions": [s["id"] for s in sessions if s["stream"] == "cards"][:3], "fix": "audit every shot against the component list"}],
                 "rot": [{"session": s["id"], "handoffs": s["handoffs"], "msgs": s["msgs"]} for s in sessions if s["handoffs"]][:5],
                 "side_quest_minutes": round(sum(s["end"] - s["start"] for s in sessions if s["stream"] == "ops")),
                 "patterns": ["One ask fans out into 3–5 chats, then a 'sanity check' chat reconciles them: reconciling is the bottleneck.",
                              "Each scene is touched by many chats; the cut only moves when one chat owns the scene.",
                              "Steering repeats the same correction ('still a screenshot') until it becomes a gate.",
                              "Side quests spike right before the deadline."]},
}
json.dump(data, open(OUT, "w"), separators=(",", ":"))
print(len(sessions), "sessions", len(events), "events", len(prs), "prs")
