# Architecture drift

`ArchitectureDriftDetector` captures a lightweight architecture fingerprint
of a project (file count per top-level dir, LOC, dependency count, largest
files, test/source/doc balance) and compares baseline vs current to score
drift.

## CLI

```bash
demo2project drift:check --project ./path
demo2project drift:compare --project ./path --before <id> --after <id>
```

## Detectors

- `file_count_explosion` — sudden file count jump
- `dependency_bloat` — many new deps in one round
- `oversized_file` — any source file ≥ 800 lines
- `doc_code_imbalance` — source grew without doc growth
- `test_source_ratio_drop` — test-to-source ratio dropped
- `top_level_directory_sprawl` — > +3 top-level dirs

Snapshots are persisted at `.demo2project/arch-snapshots/<id>.json`.
