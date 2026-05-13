import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import { fileExists } from '../../utils/fs.js';
import { loadSecurityPolicy, validate as validatePolicy } from '../../security/policy/SecurityPolicyEngine.js';
import { verify as verifyAudit } from '../../governance/audit/AuditVerifier.js';
import { status as emergencyStatus } from '../../governance/incidents/EmergencyStop.js';

const exec_ = promisify(exec);

export interface ProbeResult {
  name: string;
  ok: boolean;
  detail?: string;
  remediation?: string;
}

export interface DiagnosticReport {
  generated_at: string;
  ok: boolean;
  probes: ProbeResult[];
  summary: string;
}

async function probeCmd(cmd: string, name: string): Promise<ProbeResult> {
  try {
    const r = await exec_(cmd, { timeout: 5000 });
    return { name, ok: true, detail: r.stdout.trim().slice(0, 200) };
  } catch (e) {
    return { name, ok: false, detail: (e as Error).message.slice(0, 200), remediation: `command \`${cmd}\` failed; check PATH and install` };
  }
}

export async function diagnose(systemRoot: string, projectPath?: string): Promise<DiagnosticReport> {
  const probes: ProbeResult[] = [];
  probes.push(await probeCmd('node --version', 'node'));
  probes.push(await probeCmd('pnpm --version', 'pnpm'));
  probes.push(await probeCmd('git --version', 'git'));
  // Demo2Project artifacts
  probes.push({
    name: 'tsconfig present',
    ok: fileExists(path.join(systemRoot, 'tsconfig.json')),
    remediation: 'this is the system root; tsconfig.json must exist',
  });
  probes.push({
    name: 'dist built',
    ok: fileExists(path.join(systemRoot, 'dist', 'cli', 'index.js')),
    remediation: 'run `pnpm build`',
  });
  const pol = await loadSecurityPolicy(systemRoot);
  const v = validatePolicy(pol);
  probes.push({ name: 'security policy', ok: v.ok, detail: v.errors.join('; ') || 'ok', remediation: v.ok ? undefined : 'run `pnpm demo2project config:migrate`' });
  const chain = await verifyAudit(systemRoot);
  probes.push({ name: 'audit chain', ok: chain.ok, detail: chain.ok ? `${chain.total} events` : `broken at ${chain.broken_at}` });
  const es = await emergencyStatus(systemRoot);
  probes.push({ name: 'emergency stop', ok: !es.active, detail: es.active ? `ACTIVE: ${es.reason}` : 'inactive' });
  if (projectPath) {
    probes.push({
      name: 'project path exists',
      ok: fileExists(projectPath),
      remediation: 'check the --project argument',
    });
    probes.push({
      name: 'project config',
      ok: fileExists(path.join(projectPath, '.demo2project', 'config.json')),
      remediation: 'run `pnpm demo2project init --project <path>`',
    });
  }
  const ok = probes.every((p) => p.ok);
  return {
    generated_at: new Date().toISOString(),
    ok,
    probes,
    summary: ok ? 'All probes pass.' : `${probes.filter((p) => !p.ok).length} probe(s) failed; see remediations.`,
  };
}
