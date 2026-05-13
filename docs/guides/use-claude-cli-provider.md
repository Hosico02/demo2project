# Use the Claude CLI provider

```bash
pnpm demo2project provider:test --provider claude-cli --enabled --timeout-ms 90000
```

This calls the real `claude -p` subprocess. The current contract:

1. Demo2Project sends a structured prompt with system_policy, allowed_actions, forbidden_actions, and a `<<<BEGIN_UNTRUSTED_REPO_CONTENT>>>` block.
2. Claude must return JSON: `{ summary, changed_files, commands_run, ... }`.
3. Demo2Project parses the JSON. If parsing requires regex to extract JSON from prose, `confidence` is downgraded.
4. Confidence `low` is **never** allowed to mark a task `completed`.

## When it works

- Small, well-defined tasks ("scaffold README.md with Install + Usage").
- Repos with clear archetype.

## Known issues (v0.0.8 carryover)

- Claude often embeds JSON inside string fields → confidence=low.
- Live calls are slow (30–60s/call).
- Tightening the executor prompt template is the v0.0.9 candidate.
