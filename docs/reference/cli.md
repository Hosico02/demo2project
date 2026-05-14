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
| `iterate --project <path>` | Iteration round |
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

Research networking is disabled unless `--web` is passed. The default provider
uses the research allowlist in `NetworkGuard`, records network intents under
the project, and treats all external content as untrusted evidence. The report
is for capability extraction only; it must not be used to copy competitor text,
code, UI, names or brand assets.

## QA

| Command | Purpose |
|---|---|
| `qa:preflight --project <path>` | Active QA case count |
| `qa:learn --events <file>` | Learn new cases |
| `qa:regression --project <path>` | Regression spec |
| `qa:audit / qa:retire / qa:promote` | Lifecycle |
| `qa:health / qa:compact / qa:merge / qa:retire-stale / qa:report-memory` | Memory ops |
| `qa:applicable / qa:transfer` | Cross-project applicability |

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
