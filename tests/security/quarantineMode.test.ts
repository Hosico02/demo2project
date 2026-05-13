import { describe, it, expect } from 'vitest';
import { isActionAllowed, describeAllowedActions } from '../../src/security/untrusted/QuarantineMode.js';

describe('QuarantineMode', () => {
  it('quarantined repo only allows report_export', () => {
    const rec = { project_path: '/x', trust_level: 'quarantined' as const, reasons: [], set_at: '', set_by: 'user' };
    expect(isActionAllowed(rec, 'command_execution').allowed).toBe(false);
    expect(isActionAllowed(rec, 'report_export').allowed).toBe(true);
  });
  it('untrusted repo blocks command_execution', () => {
    const rec = { project_path: '/x', trust_level: 'untrusted' as const, reasons: [], set_at: '', set_by: 'system' };
    expect(isActionAllowed(rec, 'command_execution').allowed).toBe(false);
    expect(isActionAllowed(rec, 'file_read').allowed).toBe(true);
  });
  it('trusted repo allows anything', () => {
    const rec = { project_path: '/x', trust_level: 'trusted' as const, reasons: [], set_at: '', set_by: 'user' };
    expect(isActionAllowed(rec, 'command_execution').allowed).toBe(true);
  });
  it('describes blocked and allowed actions per level', () => {
    const d = describeAllowedActions({ project_path: '/x', trust_level: 'untrusted', reasons: [], set_at: '', set_by: 'system' });
    expect(d.blocked).toContain('command_execution');
  });
});
