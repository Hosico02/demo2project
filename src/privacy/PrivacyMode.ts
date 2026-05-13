import path from 'node:path';
import { writeJson, readJsonSafe } from '../utils/json.js';
import { ensureDir } from '../utils/fs.js';

export type PrivacyModeName = 'normal' | 'private' | 'strict_private' | 'enterprise_restricted';

export interface PrivacySettings {
  mode: PrivacyModeName;
  record_raw_stdout: boolean;
  record_absolute_paths: boolean;
  record_source_snippets: boolean;
  record_repo_identifiers: boolean;
  redact_replay_bundles: boolean;
  redact_reports: boolean;
}

const PRESETS: Record<PrivacyModeName, PrivacySettings> = {
  normal: { mode: 'normal', record_raw_stdout: false, record_absolute_paths: false, record_source_snippets: true, record_repo_identifiers: true, redact_replay_bundles: true, redact_reports: true },
  private: { mode: 'private', record_raw_stdout: false, record_absolute_paths: false, record_source_snippets: true, record_repo_identifiers: false, redact_replay_bundles: true, redact_reports: true },
  strict_private: { mode: 'strict_private', record_raw_stdout: false, record_absolute_paths: false, record_source_snippets: false, record_repo_identifiers: false, redact_replay_bundles: true, redact_reports: true },
  enterprise_restricted: { mode: 'enterprise_restricted', record_raw_stdout: false, record_absolute_paths: false, record_source_snippets: false, record_repo_identifiers: false, redact_replay_bundles: true, redact_reports: true },
};

const FILE = 'config/privacy.json';

export async function loadMode(systemRoot: string): Promise<PrivacySettings> {
  const p = await readJsonSafe<PrivacySettings>(path.join(systemRoot, FILE));
  return p ?? PRESETS.normal;
}

export async function setMode(systemRoot: string, mode: PrivacyModeName): Promise<PrivacySettings> {
  const next = PRESETS[mode];
  await ensureDir(path.dirname(path.join(systemRoot, FILE)));
  await writeJson(path.join(systemRoot, FILE), next);
  return next;
}
