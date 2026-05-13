import path from 'node:path';
import { promises as fs } from 'node:fs';
import { ensureDir, fileExists } from '../utils/fs.js';
import { readJsonSafe, writeJson } from '../utils/json.js';
import type { ExtensionManifest } from './ExtensionManifest.js';

function registryPath(systemRoot: string): string {
  return path.join(systemRoot, '.demo2project', 'extensions', 'registry.json');
}

export interface RegistryEntry {
  manifest: ExtensionManifest;
  installed_at: string;
  source_path: string;
  enabled: boolean;
  approval_id?: string;
}

export async function loadRegistry(systemRoot: string): Promise<RegistryEntry[]> {
  const p = registryPath(systemRoot);
  const r = await readJsonSafe<RegistryEntry[]>(p);
  return r ?? [];
}

export async function saveRegistry(systemRoot: string, entries: RegistryEntry[]): Promise<string> {
  const p = registryPath(systemRoot);
  await ensureDir(path.dirname(p));
  await writeJson(p, entries);
  return p;
}

export async function add(systemRoot: string, entry: RegistryEntry): Promise<RegistryEntry[]> {
  const entries = await loadRegistry(systemRoot);
  const idx = entries.findIndex((e) => e.manifest.name === entry.manifest.name);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);
  await saveRegistry(systemRoot, entries);
  return entries;
}

export async function disable(systemRoot: string, name: string): Promise<RegistryEntry | null> {
  const entries = await loadRegistry(systemRoot);
  const e = entries.find((x) => x.manifest.name === name);
  if (!e) return null;
  e.enabled = false;
  await saveRegistry(systemRoot, entries);
  return e;
}

void fs;
void fileExists;
