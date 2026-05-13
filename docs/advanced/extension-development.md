# Extension development

```
my-extension/
├── demo2project.extension.json
└── index.js
```

`index.js`:

```javascript
// Minimal "policy_rule" extension.
export default {
  type: 'policy_rule',
  contribute(ctx) {
    // ctx.granted_capabilities is the array of capabilities you can use.
    if (!ctx.granted_capabilities.includes('add_policy_rule')) return [];
    return [{
      id: 'X001',
      action: 'file_write',
      decision: 'deny',
      reason: 'data/ writes disallowed in untrusted repos',
      match_target_prefix: ['data/'],
      risk_level: 'medium',
    }];
  },
};
```

## Safety rules

1. Never write outside `ctx.project_path`.
2. Never spawn subprocesses without `run_commands` capability.
3. Never read `.env` or similar; use the host SDK if you need config.
4. Never call network without `network_access`.
5. Return data structures only; let the host decide.

## Testing

Use `extensions:validate` and `extensions:security-review` locally before publishing.
