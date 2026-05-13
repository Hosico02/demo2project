# SDK reference

```typescript
import { Demo2ProjectClient } from 'demo2project';

const client = new Demo2ProjectClient({
  projectPath: './my-demo',
  profile: 'conservative',
});

const analysis = await client.analyze();
const gap = await client.gap();
const pre = await client.qa.preflight();
const trust = await client.security.trustReport();
const cfg = await client.config.effective();
```

See `examples/sdk/` for runnable code:

- `examples/sdk/basic-analysis.ts`
- `examples/sdk/qa-preflight.ts`
- `examples/sdk/trust-report.ts`

## Guarantees

- SDK does **not** bypass `SecurityPolicyEngine`.
- SDK defaults to `conservative` profile.
- All async methods return plain JSON-friendly objects (no streams).
- Types are exported.

## Limits

- SDK does not yet wrap the iterate loop end-to-end with progress events; consume CLI output instead for now.
- SDK is internal-versioned; semver compatibility is `^0.0.x` — minor versions may change shape until v0.1.0.
