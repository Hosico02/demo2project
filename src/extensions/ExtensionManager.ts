import path from 'node:path';
import { promises as fs } from 'node:fs';
import { readJsonSafe } from '../utils/json.js';
import { fileExists } from '../utils/fs.js';
import { validate as validateManifest } from './ExtensionManifest.js';
import type { ExtensionManifest } from './ExtensionManifest.js';
import { review as securityReview } from './ExtensionSecurityReview.js';
import type { ReviewReport } from './ExtensionSecurityReview.js';
import { loadFromDir } from './ExtensionLoader.js';
import type { LoadedExtension } from './ExtensionLoader.js';
import { loadRegistry, saveRegistry, add as registryAdd, disable as registryDisable } from './ExtensionRegistry.js';
import type { RegistryEntry } from './ExtensionRegistry.js';
import { append as auditAppend } from '../governance/audit/AuditLog.js';
import { nowIso } from '../utils/time.js';

export class ExtensionManager {
  constructor(private readonly systemRoot: string) {}

  async scan(): Promise<{ dirs: string[] }> {
    const root = path.join(this.systemRoot, '.demo2project', 'extensions');
    if (!fileExists(root)) return { dirs: [] };
    let entries: string[] = [];
    try { entries = await fs.readdir(root); } catch { return { dirs: [] }; }
    const dirs: string[] = [];
    for (const e of entries) {
      const p = path.join(root, e);
      try {
        const stat = await fs.stat(p);
        if (stat.isDirectory()) dirs.push(p);
      } catch { /* ok */ }
    }
    return { dirs };
  }

  async list(): Promise<RegistryEntry[]> {
    return loadRegistry(this.systemRoot);
  }

  async validateAt(dir: string): Promise<{ manifest: ExtensionManifest | null; valid: boolean; errors: string[]; warnings: string[] }> {
    const manifestPath = path.join(dir, 'demo2project.extension.json');
    const raw = await readJsonSafe<ExtensionManifest>(manifestPath);
    if (!raw) return { manifest: null, valid: false, errors: ['manifest not found'], warnings: [] };
    const v = validateManifest(raw);
    return { manifest: raw, valid: v.ok, errors: v.errors, warnings: v.warnings };
  }

  async securityReview(dir: string): Promise<ReviewReport | { error: string }> {
    const v = await this.validateAt(dir);
    if (!v.manifest) return { error: 'manifest not found' };
    if (!v.valid) return { error: `manifest invalid: ${v.errors.join('; ')}` };
    return review(dir, v.manifest);
  }

  async install(dir: string, opts: { approvalId?: string } = {}): Promise<{ installed: RegistryEntry | null; review: ReviewReport | { error: string } }> {
    const v = await this.validateAt(dir);
    if (!v.manifest || !v.valid) {
      return { installed: null, review: { error: `manifest invalid: ${v.errors.join('; ')}` } };
    }
    const rev = await this.securityReview(dir);
    if ('error' in rev) return { installed: null, review: rev };
    if (rev.recommended_action === 'reject') return { installed: null, review: rev };
    if (rev.requires_approval && !opts.approvalId) {
      return { installed: null, review: rev };
    }
    const entry: RegistryEntry = {
      manifest: v.manifest,
      installed_at: nowIso(),
      source_path: dir,
      enabled: true,
      approval_id: opts.approvalId,
    };
    await registryAdd(this.systemRoot, entry);
    await auditAppend(this.systemRoot, {
      actor: 'extension_manager',
      action: 'extension:install',
      target: v.manifest.name,
      decision: 'installed',
      risk_level: v.manifest.risk_level === 'high' ? 'high' : 'medium',
      approval_id: opts.approvalId,
      metadata: { type: v.manifest.type, version: v.manifest.version, permissions: v.manifest.permissions_required },
    });
    return { installed: entry, review: rev };
  }

  async disable(name: string): Promise<RegistryEntry | null> {
    const r = await registryDisable(this.systemRoot, name);
    if (r) {
      await auditAppend(this.systemRoot, {
        actor: 'extension_manager',
        action: 'extension:disable',
        target: name,
        decision: 'disabled',
        risk_level: 'low',
      });
    }
    return r;
  }

  async load(name: string): Promise<LoadedExtension | null> {
    const all = await loadRegistry(this.systemRoot);
    const e = all.find((x) => x.manifest.name === name && x.enabled);
    if (!e) return null;
    return loadFromDir(e.source_path);
  }
}

// Avoid name shadowing by re-exporting helpers.
import { review } from './ExtensionSecurityReview.js';
export { saveRegistry };
