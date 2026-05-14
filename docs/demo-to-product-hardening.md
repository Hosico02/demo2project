# Demo-to-product hardening notes

This note records the issues found while testing Demo2Project against
`werewolf-demo`.

## Problems found

1. Score was too optimistic. A project could receive product-ready credit from
   files or scripts even when verification failed or was never run.
2. Failed verification was recorded, but not automatically converted into the
   next repair task. That made Demo2Project weaker than agent-self-iteration at
   finding and fixing bugs over multiple attempts.
3. QA memory was mostly observational. Preflight could warn about active QA
   cases, but planner tasks did not carry those guardrails into executor
   prompts or acceptance criteria.
4. MiniMax output handling was too brittle for real API use. One malformed JSON
   response could end a task even when a repair prompt would have recovered it.
5. Long runs needed explicit budgets, heartbeats, stop reasons, and trend
   reports. Without those, a 10-hour task is hard to audit.

## Changes made

- Evidence-weighted score gate caps score when tests/builds fail, changed files
  are unverified, or high-severity gaps remain.
- Supervisor creates a blocker repair task from failed verification evidence and
  pauses ordinary productization work until repair runs.
- QA preflight returns applicable cases; planner injects their fingerprints into
  task descriptions, acceptance criteria, and priority.
- MiniMax provider defaults to `https://api.minimaxi.com/v1`, strips thinking
  text, repairs common JSON drift, and retries once with a strict JSON repair
  prompt.
- Evaluation reports now include known defect discovery/fix metrics so score is
  not the only success signal.
- `long-run` supports `--hours`, `--in-place`, `--provider minimax-m27`,
  heartbeats, plateau stop, target-score stop, and JSON report output.
- Product-ready scoring now credits real process evidence from
  `.demo2project/iterations`, `.demo2project/events`, `.demo2project/evidence`,
  and `.demo2project/qa-cases.json`, plus CI wired to test/build commands. This
  fixes the earlier `gap=0` but `score=74` mismatch.

## Recommended 10-hour command

```bash
DEMO2PROJECT_MINIMAX=1 \
MINIMAX_API_KEY=... \
pnpm demo2project long-run \
  --project ../werewolf-demo \
  --provider minimax-m27 \
  --hours 10 \
  --iterations 200 \
  --heartbeat-seconds 300 \
  --max-no-progress-rounds 6 \
  --target-score 86 \
  --in-place \
  --output reports/long-run/werewolf-minimax.json
```

Before trusting a run, verify:

```bash
pnpm demo2project analyze --project ../werewolf-demo --evidence --verify
pnpm demo2project gap --project ../werewolf-demo --evidence --verify
python3 -m pytest -q
```

Expected current `werewolf-demo` evidence result after these changes:

- score: `86/100`
- grade: `production_ready_baseline`
- gap findings: `0`
- blockers: `0`
- score gate: `passed`
