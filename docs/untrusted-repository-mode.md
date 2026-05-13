# Untrusted repository mode

Unknown repos are treated as untrusted by default.

## Trust levels

- `trusted` — full access (manual elevation)
- `partially_trusted` — read + report only by default
- `untrusted` — read + report; no command/network/install
- `quarantined` — report only

## What gets blocked

In `untrusted` / `quarantined`:

- install scripts (`postinstall` / `preinstall` / `prepare`)
- unknown package scripts
- shell scripts
- reads of `.env`, private keys, tokens
- network access
- writes outside the project
- hook installs
- MCP servers
- global memory updates

## Allowed in untrusted

- static scan
- archetype detection
- docs truth static check
- policy scan

## CLI

```bash
pnpm demo2project trust:check --project ./path
pnpm demo2project trust:set --project ./path --level trusted
pnpm demo2project repo:quarantine --project ./path
pnpm demo2project repo:unquarantine --project ./path
```
