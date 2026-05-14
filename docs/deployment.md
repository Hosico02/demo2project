# MatrixOmnix Deployment

MatrixOmnix ships a Vite/Vue web app in `site/` and keeps the productization
engine in the repository root.

## Vercel

`vercel.json` builds `site/` and publishes `site/dist`.

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

## Supabase

Supabase is used for the hosted upload/product-artifact contract:

- `demo-archives` stores uploaded demo archives.
- `product-artifacts` stores returned product zip artifacts.
- `productization_jobs` tracks status and always records `return_format = zip`.

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The frontend currently validates archive type and size locally. A production
upload flow should use signed uploads or authenticated Supabase Storage calls,
then queue a MatrixOmnix worker to produce the product zip.
