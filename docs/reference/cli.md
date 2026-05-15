# CLI reference

Run `pnpm demo2project --help` for the live, organised list. This file
documents every command grouped by intent.

## Quickstart

| Command | Purpose |
|---|---|
| `init [--interactive] [--profile <p>] [--project <path>]` | Setup wizard or bootstrap config |
| `doctor [--project <path>]` | Environment + config diagnose |
| `next [--project <path>]` | Suggest next step |
| `quickstart [--use-example] [--project <path>]` | 5-minute demo |
| `demo` | Alias for `quickstart --use-example` |

## Core

| Command | Purpose |
|---|---|
| `analyze --project <path>` | ProjectSnapshot + ProjectScore |
| `gap --project <path>` | GapReport |
| `plan --project <path>` | IterationPlan (no writes) |
| `iterate --project <path> [--web]` | Iteration round. With `--web`, MatrixOmnix refreshes the official LLM model catalog before planning when an LLM/provider surface is detected, so provider/model selector repairs can use current source-cited model choices without researching unrelated projects. |
| `self-check` | Run analyze/gap/regression + probes |
| `self-iterate[-sandbox]` | Read-only/worktree-bounded self-iteration |
| `benchmark` | Score every project under benchmarks/ + examples/ |
| `eval [--all|--case <n>]` | A/B comparison |
| `compare-executors --case <n> --providers <list>` | Provider comparison on benchmark fixtures |
| `long-run --project <path> [--hours <n>] [--provider <p>]` | Extended demo-to-product loop with trends and stop reason |

## Research

| Command | Purpose |
|---|---|
| `research --project <path> --domain <domain> --web [--query "<q>"] [--max-results <n>]` | Controlled competitor/product research. Writes `.demo2project/research/latest.json` and `.demo2project/research/latest.md`; `gap` then turns sourced missing capabilities into market gaps. |
| `models:refresh --project <path> --web` | Controlled official LLM model catalog refresh. Reads provider documentation from allowlisted official domains and writes `.demo2project/research/llm-model-catalog.json`; LLM provider repairs use this catalog when generating model choices. |

Research networking is disabled unless `--web` is passed. The default provider
uses the research allowlist in `NetworkGuard`, records network intents under
the project, and treats all external content as untrusted evidence. The report
is for capability extraction only; it must not be used to copy competitor text,
code, UI, names or brand assets.

Model catalog refresh uses the same explicit `--web` opt-in, but restricts
requests to provider-owned documentation domains such as OpenAI, DeepSeek,
Alibaba Cloud Model Studio and MiniMax. The standalone `models:refresh` command
always performs this explicit refresh; `iterate --web` performs it only when the
target project already exposes an LLM/provider/model surface or an existing
catalog. If an official page cannot be fetched or parsed, MatrixOmnix records a
warning and falls back to its source-cited snapshot seed instead of inventing
model IDs.

## QA

| Command | Purpose |
|---|---|
| `qa:preflight --project <path>` | Active QA case count |
| `qa:learn --events <file>` | Learn new cases |
| `qa:regression --project <path>` | Regression spec |
| `qa:audit / qa:retire / qa:promote` | Lifecycle |
| `qa:health / qa:compact / qa:merge / qa:retire-stale / qa:report-memory` | Memory ops |
| `qa:applicable / qa:transfer` | Cross-project applicability |

## Generalized Demo Surfaces

MatrixOmnix now detects delivery surfaces independently from the main project
archetype. Specialized demos such as browser extensions, notebooks, mobile
apps, desktop shells, games, 3D/WebGL scenes, ML model demos and media
processing pipelines get a `missing_demo_surface_contract_matrix` gap when
they lack `docs/productization-surface-map.md` and
`scripts/surface-contract-check.mjs`. The rule-based executor can add that
matrix with `surface:contract-check`, giving later agents a concrete boundary
before they apply UI, API, CLI, data or worker-specific optimizations.

Specialized surfaces also receive dedicated executable contract gaps when their
own harness is missing:

| Surface | Gap | Verification |
|---|---|---|
| Browser extension | `missing_browser_extension_contract_harness` | `node scripts/browser-extension-contract-check.mjs` |
| Notebook | `missing_notebook_contract_harness` | `node scripts/notebook-contract-check.mjs` |
| Mobile app | `missing_mobile_contract_harness` | `node scripts/mobile-contract-check.mjs` |
| Desktop app | `missing_desktop_contract_harness` | `node scripts/desktop-contract-check.mjs` |
| Game or simulation | `missing_game_contract_harness` | `node scripts/game-contract-check.mjs` |
| 3D/WebGL scene | `missing_3d_scene_contract_harness` | `node scripts/3d-scene-contract-check.mjs` |
| ML model or inference demo | `missing_ml_model_contract_harness` | `node scripts/ml-model-contract-check.mjs` |
| Media processing pipeline | `missing_media_pipeline_contract_harness` | `node scripts/media-pipeline-contract-check.mjs` |

## Security (Phase 7)

| Command | Purpose |
|---|---|
| `security:threat-model / security:threat --id <id>` | Threat catalog |
| `policy:validate / policy:explain --action <a> / policy:check --command "<c>" / policy:violations / policy:report` | SecurityPolicyEngine |
| `permissions:list / permissions:explain / permissions:issue / permissions:revoke / permissions:audit` | CapabilityManager |
| `trust:check / trust:set / trust:report / trust:explain / repo:quarantine / repo:unquarantine` | Trust |
| `prompt-injection:scan / prompt-injection:explain` | Prompt defense |
| `secrets:scan / secrets:scan-log / secrets:report` | Secret protection |
| `supply-chain:scan / supply-chain:diff / supply-chain:report` | Supply chain |
| `guard:check-command / guard:check-file / guard:report` | Guards |
| `approval:list / approval:show / approval:approve / approval:reject / approval:revoke` | Approval workflow |
| `audit:show / audit:verify / audit:report / audit:explain` | Audit log |
| `incident:list / incident:show / incident:resolve / emergency:stop / emergency:status / emergency:resume` | Incidents |
| `privacy:mode / privacy:set-mode / privacy:inventory / privacy:delete / retention:policy / retention:cleanup` | Privacy |
| `plugin:scan / mcp:scan / hooks:scan / integration:security-report` | Integration security |
| `governance:roles / governance:whoami / governance:can / governance:report` | RBAC |
| `claude:install-security-hooks / claude:uninstall-security-hooks / claude:hooks-status` | Claude hooks |

## Product (Phase 8)

| Command | Purpose |
|---|---|
| `config:show / config:explain / config:validate / config:migrate / config:diff / config:export` | Unified config |
| `diagnose / troubleshoot / logs:explain / remediation` | Diagnostics |
| `report:project / report:security / report:trust / report:workspace / report:html / report:index` | Reports |
| `claude:setup / claude:doctor / claude:generate-settings / claude:provider-guide` | Claude integration UX |
| `github:install-workflows / github:workflows-status / ci:install / ci:explain` | GitHub Actions |
| `extensions:list / extensions:scan / extensions:validate / extensions:security-review / extensions:install / extensions:disable` | Extensions |
| `recipes:list / recipes:show / recipes:recommend / recipes:run` | Recipes |
| `compatibility / compatibility:report` | Compatibility |
| `release:check / release:notes / migration:check / migrate` | Release |
| `product:score / product:report` | Product readiness |
| `ux:check / ux:report / docs:check` | UX / docs |
| `examples:list / examples:run / examples:report` | Examples |

## Autonomy (Phase 6)

`autonomy:policy / autonomy:set-level / autonomy:explain / autonomy:run / autonomy:status / autonomy:report / trend:show / drift:check / regression:bisect / rollback:stable / self:diagnose / self:hypotheses / self:experiment / planner:calibrate / executor:reliability / replay:create / replay:run / scenario:list / scenario:run / governance:log / handoff:create`

`long-run` accepts `--iterations`, `--hours`, `--max-seconds`,
`--target-score`, `--max-no-progress-rounds`, `--heartbeat-seconds`,
`--output`, `--in-place`, and `--provider rule-based|mock|minimax-m27`.

## Learning (Phase 5)

`archetype / standards:list / standards:explain / standards:validate / qa:transfer / corpus:add / corpus:evaluate / learn:workspace / learn:patterns / learning:candidates / learning:approve / similar / generalize / report:workspace / taxonomy:list / redact:test`
