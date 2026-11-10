---
name: taste-atlas
description: >-
  Pick named design techniques (and real reference posts) from the Taste Atlas before building a site
  or UI component, then build to a brief. Use when asked to design, style or restyle a page, landing
  site, card or ephemeral-UI component "in my taste", "like my bookmarks", or with a named mood
  (calm, premium, precise, alive, editorial, tactile), or when a page looks generic.
---

# Taste Atlas

The atlas files every visual decision in four levels: OPERATION (what the viewer should do) →
DOMAIN (which property carries it) → TECHNIQUE (the named mechanism) → EXECUTION (a specimen).
Each technique has a web recipe (`ui`). When the owner's bookmarks are present, each technique also
lists real posts he saved as references.

CLI (Node 22+, no install): `<repo>/examples/taste-atlas/scripts/atlas.mjs`. JSON on stdout.

## Steps

1. Find techniques for the request:
   `node atlas.mjs suggest "calm premium pricing card with live numbers"`, or
   `node atlas.mjs list --op evoke`, or `node atlas.mjs search chrome`. Pick 2-4 techniques that
   serve one operation; more than four muddies the page.
2. Get the brief: `node atlas.mjs brief <id...> --md` for a site, add `--component` for one UI
   component or ephemeral-ui card. Ids: technique (`closure`), specimen (`closure--2`), domain
   (`infer/grouping`) or operation (`infer`).
3. Build. Every technique in the brief must be visible in a screenshot. Say which element carries
   which technique, in the PR or reply.
4. Check: screenshot light and dark, desktop and phone; for each technique name the element that
   carries it. If one is not visible, fix it or drop it from the claim.

The owner can also hand you a brief: the atlas card has "Copy site brief" and "Component brief"
buttons for the focused node, and `window.__atlas.brief([ids], "site"|"component")` returns the JSON
(`kind: taste-atlas.brief.v1`).

## Live brainstorm board

When the owner wants to brainstorm a design with you while you talk, open a temporary board and
keep it updated; the page refreshes within a second of each write. CLI: `scripts/board.mjs`.

1. `node board.mjs start "<project>" --goal "<one line>"` → `{id, url}`. Send him the url (set
   `TASTE_BOARD_URL` to the tailnet address first); inside a Tern pane it docks beside the chat.
2. Pull references as the talk moves: `search <id> "<query>" --from mine,portfolio,dribbble,behance,mobbin`
   (`mine` = his bookmarks and sources, `portfolio` = his own apps, sites, films, repos; `"*"` = all),
   `ref <id> <url...> --note "why"` for links he names, `techniques <id> "<request>"` for atlas picks,
   `push <id> '{"palette":[...],"type":[...]}'` and `say <id> "<short note>"`.
3. Build a first pass early and `preview <id> <file.html|dir>`; re-run it after every change.
4. Read `status <id>` before each next step: liked, pinned and noped references and his typed notes
   steer the design. Pinned beats liked; never bring back a noped reference.

## Rules

- References are the owner's private bookmarks: link them in local briefs only; never paste their
  text, images or URLs into a public repo, issue or post.
- Labels come from a vision-model teacher (image + text) and are estimates; treat a reference as a
  lead to look at, not proof that it shows the technique.
- References include "sources" (`layer` field): `ask` = something the owner asked to recreate or
  triage (his words are in `text`, the post in `post`), `film` = a video he made, `ref` = an ad, film or open prompt corpus he studies (with
  `stats` reach numbers: judge by likes per view, not raw paid views), `project`/`idea` =
  his own work, `portfolio` = an app from his portfolio (`site`, `repo`, `cat`). When a brief cites an
  `ask`, re-read what he asked before building.
- `node atlas.mjs export` is the stable machine-readable taxonomy (`taste-atlas.taxonomy.v1`).
