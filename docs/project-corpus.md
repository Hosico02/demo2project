# Project corpus

A local-only index of real projects you've evaluated. **Nothing leaves
your machine.**

## Privacy posture

- Absolute project paths are sha256-hashed (12-char prefix) for the
  `path_hash` field and `redact()`-ed for the human-readable `path` field.
- Anonymized reports include only: archetype, archetype confidence,
  standard name, score totals, score breakdown, structure summary, doc
  truth count, anti-gaming finding count — **never raw source**.
- All persisted strings go through `redact()` before write.

## CLI

```bash
demo2project corpus:add --project ./path [--name <n>] [--tags <a,b>] [--notes <s>]
demo2project corpus:list
demo2project corpus:evaluate --id <id>
demo2project corpus:evaluate --all
demo2project corpus:remove --id <id>
demo2project corpus:report
```

## Storage layout

```
corpus/
  projects.json                # ProjectCorpusEntry[]
  reports/<id>.json            # per-eval AnonymizedCorpusReport
  anonymized/<id>.json         # same content (both already anonymized)
  learning/patterns.json       # cross-project LearningPatterns
  learning/standard-suggestions.json
  learning/governance/candidates.json
```

## What if I want to forget a project?

`corpus:remove --id <id>`. The entry is removed from `projects.json`; the
`reports/<id>.json` and `anonymized/<id>.json` remain on disk and can be
deleted manually. We do not auto-delete to avoid losing cross-project
signal accidentally.
