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
6. Public product surfaces could overpromise. A UI could advertise hosted
   upload/processing/artifact-return flows even when the repo only contained a
   static frontend and no API, worker or storage implementation.
7. Product standards were too static. The analyzer could compare a demo against
   built-in rules, but it could not gather current competitor/product evidence
   for an unfamiliar domain before planning productization work.
8. LLM provider model choices were too static. A UI could offer provider
   selection while still forcing users to type stale or unknown model IDs.
9. Demo-type generalization still missed specialized delivery surfaces such as
   browser extensions, notebooks, mobile shells, desktop shells, games,
   3D/WebGL scenes, ML model demos and media pipelines.
10. Mechanical deployment gaps could still be handed to MiniMax as free-form
    edits. In live werewolf runs this created a bad intermediate Flask
    Dockerfile before a later gate repaired it.
11. CI could pass while installing Python dependencies without the
    `constraints.txt` policy used by Docker and local setup.
12. Model-backed advisory roles could spend a full timeout window before
    falling back to source-backed research, making each iteration slower even
    when safe deterministic fallback tasks were already available.
13. Planner batching was too conservative for broad deterministic backlogs. In
    restored werewolf runs it needed five iterations, and Dockerfile/wsgi
    deployment gaps could still appear as duplicate scaffold work in the same
    round.
14. Advisory agents still ran during final mechanical closeout rounds, even
    when only deployment or operations documentation remained.

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
- UI/product gap analysis now flags unimplemented hosted-service claims. Planner
  turns the finding into a dedicated task, and the rule-based executor can
  rewrite unsupported upload/return surfaces into explicit beta CLI usage
  guidance.
- Market research is now a first-class, controlled harness. `matrixomnix
  research --project <path> --domain <domain> --web` writes source-cited
  reports under `.demo2project/research`; `gap` consumes only sourced
  capabilities and planner/executor can create a market-research roadmap without
  copying competitor IP.
- Official LLM model catalog refresh is now a controlled harness.
  `matrixomnix models:refresh --project <path> --web` reads allowlisted official
  provider documentation, writes `.demo2project/research/llm-model-catalog.json`,
  and LLM provider repairs expose `models`, `default_model`, `source_url` and
  `source_kind` in generated provider presets.
- `matrixomnix iterate --project <path> --web` now refreshes that same official
  model catalog before analysis/planning when an LLM/provider surface is
  detected, so the closed-loop agents can discover and repair stale or empty
  model selectors without a separate manual refresh step and without applying
  model research to unrelated demos.
- Delivery-surface detection now recognizes specialized demo shapes including
  browser extensions, notebooks, mobile apps, desktop shells, games, 3D/WebGL
  scenes, ML model demos and media pipelines. When such a surface appears,
  `gap` asks for a productization surface map and `surface:contract-check`
  harness before agents apply UI/API/CLI assumptions.
- Browser extension, notebook, mobile, desktop, game, 3D, ML and media
  surfaces now also get dedicated contract harnesses. The generated scripts
  validate manifest and entry evidence, notebook parseability, platform config,
  renderer/game-loop/model/media-pipeline evidence, or desktop shell evidence
  before further productization work is planned.
- MiniMax now routes mechanical Flask deployment tasks such as missing
  `Dockerfile`, `.dockerignore` and `wsgi.py` through the deterministic
  deployment scaffold first. The scaffold writes a gunicorn `wsgi:app`
  Dockerfile, health check, `.dockerignore`, bounded `gunicorn` constraint and
  WSGI entry without relying on model free-form edits.
- Gap analysis now flags Python CI workflows that install
  `requirements.txt` without `-c constraints.txt` when a constraints policy is
  present, and the rule-based executor rewrites Python CI to use the same
  install policy.
- MiniMax advisory now has a source-backed early fallback path. When controlled
  market research already contains usable capabilities and the advisory model is
  slow, MatrixOmnix aborts that advisory request after a short fallback budget
  and uses the source-backed fallback report instead of blocking the full
  provider timeout.
- Planner now expands broad deterministic productization backlogs to six tasks
  per round while leaving ordinary rounds at four tasks. Flask Dockerfile,
  `wsgi.py`, gunicorn and deployment-artifact gaps share one task family and
  plan as a single deterministic deployment scaffold.
- Supervisor skips model advisory when the remaining gap set is only mechanical
  deployment, CI or documentation closeout work. In the latest MiniMax werewolf
  run, the final operations-docs iteration dropped from roughly 17.6 seconds to
  2.5 seconds while preserving the same 97/100, zero-finding result.

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
  --target-score 97 \
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

- score: `97/100`
- grade: `production_ready_baseline`
- gap findings: `0`
- blockers: `0`
- score gate: `passed`
- product maturity: `market_ready` (`100/100`)
- test evidence: `33 passed`
