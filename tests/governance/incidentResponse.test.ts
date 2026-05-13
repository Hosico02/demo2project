import { describe, it, expect } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import { IncidentManager } from '../../src/governance/incidents/IncidentManager.js';
import { status as estopStatus } from '../../src/governance/incidents/EmergencyStop.js';

describe('IncidentManager', () => {
  it('creates incident and lists it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inc-'));
    const m = new IncidentManager(root);
    const i = await m.create({ type: 'prompt_injection_detected', summary: 'injection found', findings: ['x'] });
    expect(i.status).toBe('open');
    const all = await m.list();
    expect(all.length).toBe(1);
  });
  it('critical incident triggers emergency stop', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inc-'));
    const m = new IncidentManager(root);
    await m.create({ type: 'secret_exposure', summary: 'leaked', findings: [] });
    const s = await estopStatus(root);
    expect(s.active).toBe(true);
  });
  it('resolves incident', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'inc-'));
    const m = new IncidentManager(root);
    const i = await m.create({ type: 'policy_violation', summary: 'x', findings: [] });
    const r = await m.resolve(i.id, 'fixed');
    expect(r?.status).toBe('resolved');
  });
});
