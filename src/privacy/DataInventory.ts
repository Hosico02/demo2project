import path from 'node:path';
import { promises as fs } from 'node:fs';
import { stateDir } from '../utils/paths.js';

export interface InventoryEntry {
  category: string;
  path: string;
  size_bytes: number;
  last_modified: string;
  count: number;
}

export interface DataInventory {
  project_path?: string;
  system_root: string;
  entries: InventoryEntry[];
  total_size_bytes: number;
}

const CATEGORIES = [
  { dir: 'sessions', label: 'sessions' },
  { dir: 'iterations', label: 'iterations' },
  { dir: 'events', label: 'events' },
  { dir: 'evidence', label: 'evidence' },
  { dir: 'replay', label: 'replay_bundles' },
  { dir: 'audit', label: 'audit_log' },
  { dir: 'governance', label: 'governance' },
];

async function statDir(p: string): Promise<{ size: number; mtime: string; count: number }> {
  let total = 0;
  let latest = 0;
  let count = 0;
  async function walk(d: string) {
    let entries;
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        try {
          const s = await fs.stat(full);
          total += s.size;
          count++;
          if (s.mtimeMs > latest) latest = s.mtimeMs;
        } catch { /* skip */ }
      }
    }
  }
  await walk(p);
  return { size: total, mtime: latest === 0 ? '' : new Date(latest).toISOString(), count };
}

export async function inventory(systemRoot: string, projectPath?: string): Promise<DataInventory> {
  const root = projectPath ? stateDir(projectPath) : path.join(systemRoot, '.demo2project');
  const entries: InventoryEntry[] = [];
  let total = 0;
  for (const c of CATEGORIES) {
    const p = path.join(root, c.dir);
    const r = await statDir(p);
    if (r.count === 0 && r.size === 0) continue;
    entries.push({ category: c.label, path: p, size_bytes: r.size, last_modified: r.mtime, count: r.count });
    total += r.size;
  }
  return { project_path: projectPath, system_root: systemRoot, entries, total_size_bytes: total };
}
