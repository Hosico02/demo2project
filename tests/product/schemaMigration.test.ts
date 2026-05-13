import { describe, it, expect } from 'vitest';
import { migrate } from '../../src/product/config/ConfigMigration.js';
import { CONFIG_SCHEMA_VERSION } from '../../src/product/config/ConfigSchema.js';

describe('Schema migration', () => {
  it('forward migrates 0.0.6 and 0.0.7 into 0.0.8 shape', () => {
    for (const v of ['0.0.6', '0.0.7']) {
      const r = migrate({ schema_version: v, profile: 'balanced' });
      expect(r.migrated.schema_version).toBe(CONFIG_SCHEMA_VERSION);
      expect(r.migrated.privacy).toBeDefined();
      expect(r.migrated.retention).toBeDefined();
      expect(r.migrated.integrations).toBeDefined();
    }
  });
});
