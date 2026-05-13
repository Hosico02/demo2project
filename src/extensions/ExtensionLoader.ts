import path from 'node:path';
import { readJsonSafe } from '../utils/json.js';
import { fileExists } from '../utils/fs.js';
import type { ExtensionManifest } from './ExtensionManifest.js';

export interface LoadedExtension {
  manifest: ExtensionManifest;
  source_path: string;
  module: unknown;
  error?: string;
}

/**
 * Loader that NEVER throws — a broken extension cannot crash the CLI.
 */
export async function loadFromDir(dir: string): Promise<LoadedExtension | null> {
  const manifestPath = path.join(dir, 'demo2project.extension.json');
  if (!fileExists(manifestPath)) return null;
  const manifest = await readJsonSafe<ExtensionManifest>(manifestPath);
  if (!manifest) return null;
  const entry = path.join(dir, manifest.entry);
  if (!fileExists(entry)) {
    return { manifest, source_path: dir, module: null, error: `entry not found: ${manifest.entry}` };
  }
  try {
    const module = await import(entry);
    return { manifest, source_path: dir, module };
  } catch (e) {
    return { manifest, source_path: dir, module: null, error: (e as Error).message };
  }
}
