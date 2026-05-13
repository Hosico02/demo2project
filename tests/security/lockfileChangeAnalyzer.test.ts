import { describe, it, expect } from 'vitest';
import { analyzeLockfileChange } from '../../src/security/supply-chain/LockfileChangeAnalyzer.js';

describe('LockfileChangeAnalyzer', () => {
  it('flags large changes', () => {
    const before = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const after = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const r = analyzeLockfileChange(before, after);
    expect(r.large_change).toBe(true);
  });
  it('does not flag small changes', () => {
    const before = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const after = Array.from({ length: 103 }, (_, i) => `line ${i}`).join('\n');
    const r = analyzeLockfileChange(before, after);
    expect(r.large_change).toBe(false);
  });
});
