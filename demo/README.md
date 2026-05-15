# MatrixOmnix Stress Demos

This folder contains intentionally incomplete demo projects used to pressure-test
MatrixOmnix generalization. Each fixture should be recognizable as a real demo
surface, but should still lack product-grade contracts, verification or docs.

Run the productization stress pass from the repo root:

```bash
pnpm build
pnpm demo:stress
```

This copies each fixture into `demo/productized/`, runs MatrixOmnix with the
rule-based executor, and writes `demo/reports/stress-report.json` plus
`demo/reports/stress-report.md`.

`pnpm demo:stress` is a baseline regression gate: expected fixture-specific
gaps must be detected, the generated product files must exist, those expected
gaps must be closed, and no blocker may remain. It does not mean every fixture
has become an industrial product.

For the stricter product target:

```bash
pnpm demo:stress:product-ready
```

This requires every productized fixture to reach `production_ready_baseline`
with no remaining findings. It is intentionally stricter than the baseline gate.

For a read-only detection/planning check:

```bash
pnpm demo:stress:plan
```
