import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import type { ProjectStandard } from '../core/types.js';
import { detectArchetype, type ProjectArchetype } from '../core/projectArchetypeDetector.js';
import { loadStandard, listStandards } from './standardsLibrary.js';
import { readJsonSafe } from '../utils/json.js';

/**
 * AdaptiveProjectStandardManager (Phase 5).
 *
 * Selects the best ProjectStandard for a given project, explains the
 * decision, and surfaces missing capabilities.
 *
 *   - Uses ProjectArchetypeDetector to pick the right archetype-specific
 *     standard.
 *   - Falls back to base/generic-project if confidence is low.
 *   - Applies any learned/workspace-standard-overrides.json on top.
 */

export interface StandardSelectionResult {
  selected_standard: ProjectStandard;
  selected_name: string;
  fallback_standard?: string;
  confidence: number;
  archetype: ProjectArchetype;
  applied_overrides: string[];
  missing_required_capabilities: string[];
  explanation: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDE_CANDIDATES = [
  path.resolve(here, 'learned', 'workspace-standard-overrides.json'),
  path.resolve(here, '..', '..', 'src', 'standards', 'learned', 'workspace-standard-overrides.json'),
];

async function loadOverrides(): Promise<Record<string, Partial<ProjectStandard>>> {
  for (const p of OVERRIDE_CANDIDATES) {
    const data = await readJsonSafe<Record<string, Partial<ProjectStandard>>>(p);
    if (data) return data;
  }
  return {};
}

export async function selectStandardForProject(projectPath: string): Promise<StandardSelectionResult> {
  const archReport = await detectArchetype(projectPath);
  const arch = archReport.primary;
  const overrides = await loadOverrides();

  const archStd = await loadStandard(arch.recommended_standard);
  const generic = await loadStandard('generic-project');
  if (!generic) throw new Error('base/generic-project.standard.json missing');

  const useArchetype = !!archStd && arch.confidence >= 0.35;
  const baseStd = useArchetype ? archStd! : generic;
  const applied: string[] = [];
  let merged: ProjectStandard = baseStd;
  if (overrides[arch.recommended_standard]) {
    merged = { ...merged, ...overrides[arch.recommended_standard] };
    applied.push(`override:${arch.recommended_standard}`);
  }

  // Compute missing required capabilities from the snapshot signals.
  const missing: string[] = [];
  for (const f of merged.required_files) {
    if (!arch.detected_signals.includes(f) && !arch.detected_signals.some((s) => s.includes(f))) {
      missing.push(`required_file:${f}`);
    }
  }
  for (const cmd of merged.required_commands) {
    if (!arch.detected_signals.some((s) => s.toLowerCase().includes(cmd))) {
      missing.push(`required_command:${cmd}`);
    }
  }

  return {
    selected_standard: merged,
    selected_name: useArchetype ? arch.recommended_standard : 'generic-project',
    fallback_standard: useArchetype ? 'generic-project' : undefined,
    confidence: arch.confidence,
    archetype: arch,
    applied_overrides: applied,
    missing_required_capabilities: missing,
    explanation:
      useArchetype
        ? `detected ${arch.id} with confidence ${(arch.confidence * 100).toFixed(0)}%; using ${arch.recommended_standard} standard${applied.length ? ` with overrides ${applied.join(',')}` : ''}`
        : `archetype confidence ${(arch.confidence * 100).toFixed(0)}% below threshold; fell back to generic-project`,
  };
}

export async function listAvailableStandards(): Promise<string[]> {
  return listStandards();
}

export async function validateAllStandards(): Promise<{
  ok: boolean;
  total: number;
  ok_count: number;
  problems: { name: string; issue: string }[];
}> {
  const names = await listStandards();
  const problems: { name: string; issue: string }[] = [];
  let okCount = 0;
  for (const name of names) {
    const std = await loadStandard(name);
    if (!std) {
      problems.push({ name, issue: 'failed to load' });
      continue;
    }
    const weightSum = std.scoring_rules.reduce((a, r) => a + r.weight, 0);
    if (Math.abs(weightSum - 100) > 1) {
      problems.push({ name, issue: `scoring_rules weights sum to ${weightSum}, expected ~100` });
      continue;
    }
    if (!Array.isArray(std.required_files)) {
      problems.push({ name, issue: 'required_files missing or wrong shape' });
      continue;
    }
    okCount++;
  }
  return { ok: problems.length === 0, total: names.length, ok_count: okCount, problems };
}
