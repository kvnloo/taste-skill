# Taste lab: your own taste, kept private

This fork adds a personal layer to tasteskill. The skill's own library deals generic directions. The taste lab lets a designer or agent work from **your** recorded taste: the posts you bookmarked, the references you confirmed, the motion you named.

## Two repositories, on purpose

| Public: this fork | Private: your taste data repo |
|---|---|
| The skill, the Visual Reference Atlas (`examples/visual-reference-atlas/`), the pipeline scripts and the docs | Your bookmark export, audits, your written taste profile and the populated taxonomy |
| Safe to share and to send upstream | Never pushed here. Bookmarks reveal what you read, so the collection stays private even when each post is public. |

Point the skill at your data with an environment variable:

```bash
export TASTE_DATA_DIR=~/path/to/your-private-taste-data
```

## Expected layout of the private repo

```
$TASTE_DATA_DIR/
  out/sync-YYYY-MM-DD/bookmarks.json   # raw export (scripts/sync_bookmarks_readonly.py)
  profile/TASTE.md                     # written, cited taste profile: read this first
  profile/bookmarks-summary.json       # counts and cited selections
  taxonomy/atlas.json                  # Visual Reference Atlas graph: purpose → material → decision → reference
  taxonomy/motion.yaml                 # named motion techniques you like, with references
```

`taxonomy/` is where the finished taxonomy lands. The atlas example imports and exports the same JSON.

## Refreshing the corpus

```bash
twitter-cli login            # once; uses your browser session, nothing is printed
python taste-lab/scripts/sync_bookmarks_readonly.py --out "$TASTE_DATA_DIR/out/sync-$(date +%F)"
```

It is read-only against X, checkpoints every page, and stops on the first API error instead of guessing that the list has ended.

## Motion vocabulary

See `taste-lab/docs/motion-vocabulary.md` for sources that name motion techniques, so a taste can be stated as "a staggered fade-through with a springy press" instead of "that nice animation".
