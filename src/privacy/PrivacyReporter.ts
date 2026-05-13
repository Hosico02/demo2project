import { loadMode } from './PrivacyMode.js';
import { loadPolicy } from './DataRetentionPolicy.js';
import { inventory } from './DataInventory.js';

export async function privacyReport(systemRoot: string, projectPath?: string): Promise<unknown> {
  const mode = await loadMode(systemRoot);
  const retention = await loadPolicy(systemRoot);
  const inv = await inventory(systemRoot, projectPath);
  return { mode, retention, inventory: inv };
}
