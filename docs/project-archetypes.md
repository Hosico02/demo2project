# Project archetypes

`ProjectArchetypeDetector` returns one of 11 archetypes plus `unknown`:

`node-cli`, `typescript-library`, `react-app`, `nextjs-app`, `python-cli`,
`python-package`, `fastapi-api`, `monorepo`, `docs-only-project`,
`agent-framework`, `unknown`.

## Signal-based scoring

Each archetype declares weighted signal probes (e.g. `package.json bin → +4`
for `node-cli`). The detector computes `raw / max` per archetype and ranks
them. Confidence below 0.35 falls back to `unknown` (caller uses
`generic-project` standard).

## CLI

```bash
demo2project archetype --project ./path
```

Output: `primary` archetype + `alternatives` (next 3 by confidence) + every
hit / missing signal so the decision is fully explainable.

## Why deterministic (no embeddings)

Cross-project learning needs a stable, debuggable signal. A vector model
would obscure why one project was bucketed differently from another; the
signal-list output here can be diffed and reviewed by humans.
