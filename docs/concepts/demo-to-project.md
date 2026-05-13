# Demo → project

A **demo** runs once on the author's machine. A **project** is something an
unrelated person could clone, install, run, test, and modify. Demo2Project
measures how far a repository is from "project-ready" and drives a loop that
narrows the gap **without** trusting the AI's word for it.

## The 9-dimension score

`ProjectScorer` produces 0–100 across:

1. structure (entrypoint, package metadata)
2. tests
3. build
4. runtime (start command works)
5. docs (README, install/usage)
6. config (env example, gitignore)
7. maintainability (no oversized files)
8. safety (no obvious secrets, no destructive defaults)
9. agent_process (CI / QA preflight / verification gate present)

Grade buckets: `raw_demo` (< 30) → `working_demo` (< 50) → `structured_prototype` (< 70) → `project_ready_candidate` (< 85) → `production_ready_baseline` (≥ 85).

## Why a score and not a checklist

A score gives a stable target across iterations. The trend across a session
is what `QualityTrendMonitor` watches; a drop triggers rollback.

## What Demo2Project is NOT

- It is **not** another coding agent. It does not generate code itself.
- It is **not** a replacement for Claude CLI. Claude is one executor among several.
- It is **not** a CI tool. CI can run Demo2Project; Demo2Project does not run CI for you.
