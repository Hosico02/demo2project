# Install Claude CLI hooks

```bash
# Install baseline + security hooks + settings.json
pnpm demo2project claude:setup --project $PROJECT

# Or step by step
pnpm demo2project claude:install-security-hooks --project $PROJECT
pnpm demo2project claude:generate-settings --project $PROJECT

# Verify
pnpm demo2project claude:doctor --project $PROJECT
pnpm demo2project claude:hooks-status --project $PROJECT
```

## What hooks do

- **PreToolUse** hooks block forbidden commands and high-risk writes BEFORE Claude executes.
- **PostToolUse** hooks append audit and evidence entries AFTER each tool call.
- **Stop** hooks veto turn completion if an open critical incident exists or the emergency stop is active.

## Override

```bash
DEMO2PROJECT_HOOKS_DISABLED=1 claude  # one-off bypass for debugging
```

## Uninstall

```bash
pnpm demo2project claude:uninstall-security-hooks --project $PROJECT
```
