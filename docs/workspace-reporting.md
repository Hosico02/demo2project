# Workspace reporting

```bash
demo2project report:workspace
```

Writes the full dashboard to `reports/workspace/`:

| file | contents |
|---|---|
| `generalization-report.json` | machine-readable per-archetype performance |
| `generalization-report.md` | same, human-friendly |
| `qa-memory-report.md` | learned patterns table (type / support / title) |
| `standard-feedback-report.md` | pending standard update suggestions |
| `corpus-report.md` | corpus contents + per-archetype counts |
| `executor-comparison-report.md` | stub — populated by `compare-executors` runs |

## How to read it

- **`generalization-report.md`** is the leading indicator: weakest
  archetypes + recommended standard updates point at the next improvement
  to make.
- **`qa-memory-report.md`** is the audit trail for what the system has
  learned. New entries should be promoted via `learning:approve` only
  after eyeballing this file.
- **`standard-feedback-report.md`** is queue-of-suggestions for raising /
  lowering scoring weights. None are auto-applied.

## How often to regenerate

Every time the corpus changes or after a meaningful eval run. The command
is cheap (no LLM, no commands) — re-running is safe.
