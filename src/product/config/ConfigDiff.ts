export interface ConfigDiffEntry {
  path: string;
  before: unknown;
  after: unknown;
  is_downgrade: boolean;
}

export interface ConfigDiffResult {
  changes: ConfigDiffEntry[];
  has_downgrade: boolean;
}

const DOWNGRADE_PATHS: { path: string; safer: (a: unknown, b: unknown) => boolean }[] = [
  { path: 'security.require_approval_for_self_modification', safer: (a, b) => a === true && b === false },
  { path: 'security.network_default', safer: (a, b) => a === 'deny' && b !== 'deny' },
  { path: 'autonomy.level', safer: (a, b) => rankAutonomy(b as string) > rankAutonomy(a as string) },
  { path: 'privacy.mode', safer: (a, b) => rankPrivacy(b as string) < rankPrivacy(a as string) },
];

function rankAutonomy(level: string): number {
  return ['L0_READ_ONLY', 'L1_ANALYZE_AND_REPORT', 'L2_SAFE_PATCH_WITH_VERIFICATION', 'L3_CODE_PATCH_WITH_APPROVAL', 'L4_SELF_ITERATION_SANDBOX', 'L5_RESTRICTED_AUTONOMOUS_LOOP'].indexOf(level);
}

function rankPrivacy(mode: string): number {
  return ['enterprise_restricted', 'strict_private', 'private', 'normal'].indexOf(mode);
}

function get(o: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, o);
}

function flatten(o: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (o === null || typeof o !== 'object' || Array.isArray(o)) {
    if (prefix) out[prefix] = o;
    return out;
  }
  for (const [k, v] of Object.entries(o)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, p));
    else out[p] = v;
  }
  return out;
}

export function diff(before: unknown, after: unknown): ConfigDiffResult {
  const b = flatten(before);
  const a = flatten(after);
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changes: ConfigDiffEntry[] = [];
  for (const k of keys) {
    if (JSON.stringify(b[k]) === JSON.stringify(a[k])) continue;
    const isDowngrade = DOWNGRADE_PATHS.some((d) => d.path === k && d.safer(b[k], a[k]));
    changes.push({ path: k, before: b[k], after: a[k], is_downgrade: isDowngrade });
  }
  return { changes, has_downgrade: changes.some((c) => c.is_downgrade) };
}

void get;
