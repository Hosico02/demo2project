# Project standard schema

Each archetype has a standard JSON at `src/standards/archetypes/<id>.standard.json`.

```jsonc
{
  "id": "node-cli",
  "name": "Node CLI",
  "required_files": ["README.md", "package.json", ".gitignore"],
  "recommended_files": [".env.example", "tests/smoke.test.mjs", ".github/workflows/ci.yml"],
  "test_commands": ["node --test tests"],
  "build_commands": [],
  "start_commands": ["node dist/index.js"],
  "scoring_weights": { "structure": 1, "tests": 1.2, "build": 0.8 }
}
```

User-supplied standards go under `~/.demo2project/standards/overrides.json`
and are gated by approval (Phase 5+).
