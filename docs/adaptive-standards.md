# Adaptive standards

## Layout

```
src/standards/
  base/
    generic-project.standard.json
  archetypes/
    node-cli, typescript-library, react-app, nextjs-app,
    python-cli, python-package, fastapi-api, monorepo,
    docs-only-project, agent-framework
  learned/
    workspace-standard-overrides.json  (optional)
```

The loader tries `archetypes/<name>.standard.json` first, then
`base/<name>.standard.json`, applying any matching key from
`learned/workspace-standard-overrides.json` last.

## Selection

`selectStandardForProject(projectPath)` runs the archetype detector and
returns:

```ts
{
  selected_standard,
  selected_name,
  fallback_standard?,
  confidence,
  archetype,
  applied_overrides,
  missing_required_capabilities,
  explanation,
}
```

If archetype confidence < 0.35, `selected_name = 'generic-project'`.

## Per-archetype weights — why they differ

- `docs-only-project`: `docs_score = 30`, `build_score = 4` — building is
  optional, docs are the artifact.
- `agent-framework`: extra weight on `safety_score` and `test_score` —
  these projects ship verification machinery, hold them to it.
- `nextjs-app`: extra `config_score` — env-var hygiene matters for things
  that ship to clients.
- `monorepo`: extra `structure_score` and `maintainability_score` — the
  whole point is clean boundaries.

Tweak via `learned/workspace-standard-overrides.json` per workspace.

## CLI

```bash
demo2project standards:list
demo2project standards:explain --project ./path
demo2project standards:validate
```

`validate` checks that every shipped standard's scoring weights sum to ~100.
