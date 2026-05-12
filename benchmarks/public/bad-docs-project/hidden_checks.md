# bad-docs-project — hidden checks

This benchmark exists specifically to exercise `demo2project docs:truth`. The
README claims many things — most are false. The truth checker must catch:

- `pnpm test` (no script)
- `pnpm run build` (no script)
- `docker build` / `docker run` (no Dockerfile)
- GitHub Actions CI (no workflows dir)
- `.env.example` (does not exist)

`pnpm start` is the one truthful claim.
