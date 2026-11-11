# Verified source study: Jason Murray's Iris

- **Original reel / creator:** [Jason Murray (@jason_swet), October 14, 2026](https://www.instagram.com/reel/Dee4c-QgT1g/)
- **Observed content:** a dynamic, visually linked taxonomy of art direction: graphic examples connected through techniques, intended meanings, and compositional decisions; nodes and visual references in an interactive spatial interface.
- **Reel access:** **PUBLIC** as of 2026-10-20; direct Instagram scraping returned 429 but unauthenticated **yt-dlp retrieved original caption, metadata and video**. Inspected 13 sampled frames locally. Not retrieved directly by Agent Reach.
- **Agent Reach:** `agent-reach doctor --json` reported Instagram `status: off`. The OpenCLI Instagram backend needs an existing, user-controlled, logged-in desktop Chrome session; the remote CI had none.
- **Named product:** [Iris / Modern Art Direction](https://visuals.modernartdirection.com/). Its publicly accessible site describes invite-only/course-linked beta access, rather than a public implementation.
- **OSS licensing:** **NOT VERIFIED / NO LICENSE OR SOURCE FOUND** for Iris itself. Do not treat a publicly viewable site as OSS.
- **Creator's statement:** beta currently available to bootcamp students; public release uncertain. Avoid copying its protected assets, internal taxonomy, descriptions, or original video.
- **Suitable OSS building block:** [React Flow](https://github.com/xyflow/xyflow), MIT, ~38,724 stars, active Oct 2026, healthy PR activity.
- **Original downstream alternative:** [Visual Reference Atlas in Taste Lab](https://github.com/kvnloo/taste-skill/pull/1). Uses original categories, CSS-generated demo specimens, attributed creator link, and no proprietary visuals.
- **CI evidence:** [Public investigation run](https://github.com/kvnloo/taste-skill/actions/runs/39446860755), original `metadata.json` and doctor output, short-lived ephemeral artifact. Initial run did not extract frames automatically because ffmpeg was absent; manual inspection of the recovered video was performed separately. **Do not claim Agent Reach retrieved this reel or that CI itself inspected visuals.**

## Follow-up quality gates
- [x] Identify original creator, project name and caption
- [x] Distinguish public Reel from private/beta product
- [x] Find maintained MIT OSS foundation
- [x] Build credited independent prototype in the fork
- [x] Pass unit tests and production build (2026-10-20)
- [ ] In-browser accessibility/visual QA; benchmark user workflow
- [ ] Verify license/provenance of all future imported image assets

Do not publish third-party video frames or session credentials.
