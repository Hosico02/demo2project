import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check } from '../../src/security/policy/SecurityPolicyEngine.js';
import { list as listViolations } from '../../src/security/policy/PolicyViolation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('PolicyViolation', () => {
  it('records a violation when a deny is hit and project_path is given', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-violation-'));
    await check(root, { action: 'command_execution', actor: 'test', command: 'sudo something', project_path: tmp });
    const violations = await listViolations(tmp);
    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]!.violation_type).toBe('denied');
  });
});
