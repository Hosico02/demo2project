import { describe, it, expect } from 'vitest';
import { explain } from '../../src/product/config/ConfigExplainer.js';
import { DEFAULT_CONFIG } from '../../src/product/config/ConfigSchema.js';

describe('ConfigExplainer', () => {
  it('returns effective + sources + notes', () => {
    const r = explain(DEFAULT_CONFIG, { profile: 'default', 'autonomy': 'default' });
    expect(r.effective.profile).toBe('balanced');
    expect(Array.isArray(r.sources)).toBe(true);
    expect(Array.isArray(r.notes)).toBe(true);
  });
});
