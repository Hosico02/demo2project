import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { checkRead, checkWrite, checkDelete, isSecretPath, isHighRiskDemo2ProjectPath } from '../../src/security/guards/FileAccessGuard.js';

describe('FileAccessGuard', () => {
  it('blocks read of .env', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fag-'));
    const r = checkRead(d, path.join(d, '.env'));
    expect(r.allowed).toBe(false);
  });
  it('blocks write outside project', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fag-'));
    const r = checkWrite(d, '/etc/passwd');
    expect(r.allowed).toBe(false);
  });
  it('blocks write to high-risk demo2project path', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fag-'));
    const target = path.join(d, 'src/core/safety.ts');
    const r = checkWrite(d, target);
    expect(r.allowed).toBe(false);
    expect(r.requires_approval).toBe(true);
  });
  it('delete always requires approval', async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'fag-'));
    const r = checkDelete(d, path.join(d, 'a.txt'));
    expect(r.allowed).toBe(false);
    expect(r.requires_approval).toBe(true);
  });
  it('isSecretPath detects .env and id_rsa', () => {
    expect(isSecretPath('.env')).toBe(true);
    expect(isSecretPath('id_rsa')).toBe(true);
    expect(isSecretPath('src/x.ts')).toBe(false);
  });
  it('isHighRiskDemo2ProjectPath detects core/safety.ts', () => {
    expect(isHighRiskDemo2ProjectPath('src/core/safety.ts')).toBe(true);
    expect(isHighRiskDemo2ProjectPath('src/foo.ts')).toBe(false);
  });
});
