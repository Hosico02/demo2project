# bad-docs-project

A project whose README lies. Demo2Project should detect every lie.

## Install

```bash
pnpm install
```

## Usage

```bash
pnpm test          # this script does NOT exist
pnpm run build     # neither does this
pnpm start         # this one is real
docker build .     # no Dockerfile exists
docker run badimg  # no image either
```

## CI

We run GitHub Actions on every push.

## Environment

Copy `.env.example` to `.env` and set values. (There is no `.env.example`.)
