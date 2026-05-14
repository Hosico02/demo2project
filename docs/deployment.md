# MatrixOmnix Deployment

MatrixOmnix ships a Vite/Vue web app in `site/` and keeps the beta
productization engine in the repository root.

## Vercel

`vercel.json` builds `site/` and publishes `site/dist`.

Production URL: <https://matrixomnix.vercel.app>

```bash
pnpm install --frozen-lockfile
pnpm --dir site build
npx vercel deploy --prod
```

Use a Vercel project name or production domain that contains `matrixomnix`,
for example `matrixomnix.vercel.app` when available.

## Render

`render.yaml` defines a static site named `matrixomnix` with SPA rewrites.
Create a Blueprint from the GitHub repository, or connect the repo as a Static
Site and use:

```bash
pnpm install --frozen-lockfile && pnpm --dir site build
```

Publish path:

```text
site/dist
```

## Deferred Backend

Hosted file intake, queued productization and artifact packaging flows are
intentionally not active in the beta site. Keep the public product surface
focused on local CLI usage until the worker, storage, isolation and review
pipeline are ready for production operation.
