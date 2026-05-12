import { describe, it, expect } from 'vitest';
import { redact, summarizeOutput } from '../src/core/redaction.js';

describe('Phase-5 redaction', () => {
  it('redacts email addresses', () => {
    expect(redact('contact alice@example.com today')).not.toContain('alice@example.com');
  });
  it('redacts /Users/<name> absolute paths', () => {
    expect(redact('found at /Users/mack/Desktop/x.ts')).toContain('/Users/***');
    expect(redact('found at /Users/mack/Desktop/x.ts')).not.toContain('/Users/mack/Desktop/x.ts');
  });
  it('redacts /home/<name> absolute paths', () => {
    expect(redact('error in /home/ubuntu/app/file.ts')).toContain('/home/***');
  });
  it('redacts IPv4 addresses', () => {
    expect(redact('host 192.168.1.42 unreachable')).toContain('***REDACTED_IP***');
  });
  it('redacts database URLs', () => {
    expect(redact('connecting postgres://user:secret@db.local/main')).toContain('***REDACTED_DB_URL***');
    expect(redact('mongodb+srv://u:p@cluster/x')).toContain('***REDACTED_DB_URL***');
  });
  it('redacts DATABASE_URL=… env-style', () => {
    expect(redact('DATABASE_URL=foo')).toContain('REDACTED');
  });
  it('summarizeOutput preserves redaction', () => {
    const huge = Array.from({ length: 80 }, (_, i) => `line ${i} alice${i}@example.com`).join('\n');
    expect(summarizeOutput(huge, 10, 1000)).not.toMatch(/@example/);
  });
});

describe('Privacy protection', () => {
  it('does not leak local username through redact()', () => {
    const sample = '/Users/mack/secret /home/mack/secret mack@example.com';
    const out = redact(sample);
    expect(out).not.toMatch(/\bmack\b/);
  });
});
