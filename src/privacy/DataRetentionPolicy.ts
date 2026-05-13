import path from 'node:path';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';

export interface DataRetentionPolicy {
  keep_sessions_days: number;
  keep_audit_log_days: number;
  keep_replay_bundles_days: number;
  keep_qa_cases_days: number;
}

export const DEFAULT_RETENTION: DataRetentionPolicy = {
  keep_sessions_days: 30,
  keep_audit_log_days: 180,
  keep_replay_bundles_days: 14,
  keep_qa_cases_days: 90,
};

const FILE = 'config/retention.json';

export async function loadPolicy(systemRoot: string): Promise<DataRetentionPolicy> {
  const p = await readJsonSafe<DataRetentionPolicy>(path.join(systemRoot, FILE));
  return p ?? DEFAULT_RETENTION;
}

export async function savePolicy(systemRoot: string, p: DataRetentionPolicy): Promise<string> {
  await ensureDir(path.dirname(path.join(systemRoot, FILE)));
  await writeJson(path.join(systemRoot, FILE), p);
  return path.join(systemRoot, FILE);
}
