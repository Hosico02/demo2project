import { describe, it, expect } from 'vitest';
import { migrate, needsMigration } from '../../src/product/config/ConfigMigration.js';

describe('ConfigMigration', () => {
  it('seeds defaults for empty input', () => {
    const r = migrate({});
    expect(r.migrated.schema_version).toBe('0.0.8');
    expect(r.migrated.profile).toBeTruthy();
    expect(r.steps.length).toBeGreaterThan(0);
  });
  it('upgrades from 0.0.7', () => {
    const r = migrate({ schema_version: '0.0.7', profile: 'balanced' });
    expect(r.from).toBe('0.0.7');
    expect(r.to).toBe('0.0.8');
    expect(r.migrated.privacy).toBeDefined();
    expect(r.migrated.retention).toBeDefined();
  });
  it('needsMigration true for old versions', () => {
    expect(needsMigration({ schema_version: '0.0.7' })).toBe(true);
    expect(needsMigration({ schema_version: '0.0.8' })).toBe(false);
  });
});
