# Analyze a demo

```bash
PROJECT=/path/to/demo
pnpm demo2project analyze --project $PROJECT
pnpm demo2project gap --project $PROJECT
pnpm demo2project archetype --project $PROJECT
pnpm demo2project recipes:recommend --project $PROJECT
```

`analyze` is read-only and idempotent. It writes nothing into the target
project unless you go on to `iterate`. `gap` runs evidence verification by
default and may execute detected test/build commands; pass `--fast` for a
static-only scan.

## Reading the output

```json
{
  "snapshot": { "detected_language": "typescript", ... },
  "score":    { "total": 39, "grade": "working_demo" },
  "gap":      { "findings": [ ... ], "blockers": [], "recommendations": [...] }
}
```

For a shareable Markdown / JSON / HTML report:

```bash
pnpm demo2project report:project --project $PROJECT
```
