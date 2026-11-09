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

## Rules

- References are the owner's private bookmarks: link them in local briefs only; never paste their
  text, images or URLs into a public repo, issue or post.
- Bookmark labels come from zero-shot CLIP and are estimates; treat a reference as a lead to look
  at, not proof that it shows the technique.
- `node atlas.mjs export` is the stable machine-readable taxonomy (`taste-atlas.taxonomy.v1`).
