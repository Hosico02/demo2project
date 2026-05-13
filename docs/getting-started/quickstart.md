# Quickstart

Five-minute walkthrough.

## 1. Install and build

```bash
pnpm install && pnpm build
```

## 2. Sanity check

```bash
pnpm demo2project doctor
```

You should see `ok: true` and all probes green.

## 3. Run the example loop

```bash
pnpm demo2project quickstart --use-example
```

This runs **analyze → gap → trust:check → qa:preflight** against `examples/bad-demo` and prints what Demo2Project found, what it means, and what's safe to run next.

## 4. Run against your own repo

```bash
pnpm demo2project init --project /path/to/your/repo --profile balanced
pnpm demo2project analyze --project /path/to/your/repo
pnpm demo2project gap --project /path/to/your/repo
pnpm demo2project trust:check --project /path/to/your/repo
pnpm demo2project iterate --project /path/to/your/repo --provider rule-based --max-iterations 1
pnpm demo2project report:project --project /path/to/your/repo
```

## 5. Read the report

A Markdown + JSON report is written to `reports/project-report/`. Open it in your editor or share the Markdown copy.

## What just happened

- Demo2Project **scored** your repo across 9 dimensions (0–100).
- It listed **gaps** with severity, why they matter, and suggested fixes.
- It evaluated **trust** of your repo (it would block untrusted scripts).
- It loaded any historical **QA cases**.
- A safe **rule-based iteration** scaffolded missing files (README, .env.example, tests/smoke, CI).
- The **verification gate** refused to mark any task done without test/build evidence.

## Where to go next

- `pnpm demo2project next` — Demo2Project recommends what's appropriate for your project's current state.
- `pnpm demo2project recipes:recommend --project <path>` — pick a recipe for your archetype.
- `docs/concepts/demo-to-project.md` — read the core concept.
- `docs/security/overview.md` — understand the safety model before scaling up.
