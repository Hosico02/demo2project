import path from 'node:path';
import { promises as fs } from 'node:fs';
import { stateDir } from '../utils/paths.js';
import { append as auditAppend } from '../governance/audit/AuditLog.js';
import { loadPolicy } from './DataRetentionPolicy.js';

export interface DeletionReport {
  project_path?: string;
  removed_files: string[];
  removed_bytes: number;
}

export async function deleteSession(systemRoot: string, projectPath: string, sessionId: string): Promise<DeletionReport> {
  const root = stateDir(projectPath);
  const targets = [
    path.join(root, 'sessions', `${sessionId}.json`),
    path.join(root, 'trend', `${sessionId}.json`),
    path.join(root, 'governance', `${sessionId}.jsonl`),
  ];
  const removed: string[] = [];
  let bytes = 0;
  for (const t of targets) {
    try {
      const s = await fs.stat(t);
      bytes += s.size;
      await fs.unlink(t);
      removed.push(t);
    } catch { /* missing is fine */ }
  }
  await auditAppend(systemRoot, {
    actor: 'data_deletion',
    action: 'privacy:delete:session',
    target: sessionId,
    decision: 'deleted',
    risk_level: 'medium',
    metadata: { project_path: projectPath, files: removed.length },
  });
  return { project_path: projectPath, removed_files: removed, removed_bytes: bytes };
}

export async function cleanupByRetention(systemRoot: string, projectPath?: string): Promise<DeletionReport> {
  const policy = await loadPolicy(systemRoot);
  const root = projectPath ? stateDir(projectPath) : path.join(systemRoot, '.demo2project');
  const cutoffs = {
    sessions: Date.now() - policy.keep_sessions_days * 86400_000,
    audit: Date.now() - policy.keep_audit_log_days * 86400_000,
    replay: Date.now() - policy.keep_replay_bundles_days * 86400_000,
  };
  const removed: string[] = [];
  let bytes = 0;
  async function sweep(dir: string, cutoffMs: number) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isFile()) {
        try {
          const s = await fs.stat(full);
          if (s.mtimeMs < cutoffMs) {
            bytes += s.size;
            await fs.unlink(full);
            removed.push(full);
          }
        } catch { /* skip */ }
      } else if (e.isDirectory()) {
        await sweep(full, cutoffMs);
      }
    }
  }
  await sweep(path.join(root, 'sessions'), cutoffs.sessions);
  await sweep(path.join(root, 'trend'), cutoffs.sessions);
  await sweep(path.join(root, 'replay'), cutoffs.replay);
  await auditAppend(systemRoot, {
    actor: 'data_deletion',
    action: 'privacy:retention:cleanup',
    target: projectPath ?? 'system',
    decision: 'cleaned',
    risk_level: 'low',
    metadata: { removed: removed.length, bytes },
  });
  return { project_path: projectPath, removed_files: removed, removed_bytes: bytes };
}
