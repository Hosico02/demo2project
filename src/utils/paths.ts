import path from 'node:path';

const STATE_DIR = '.demo2project';

export function stateDir(projectPath: string): string {
  return path.join(projectPath, STATE_DIR);
}

export function eventsDir(projectPath: string): string {
  return path.join(stateDir(projectPath), 'events');
}

export function iterationsDir(projectPath: string): string {
  return path.join(stateDir(projectPath), 'iterations');
}

export function qaCasesPath(projectPath: string): string {
  return path.join(stateDir(projectPath), 'qa-cases.json');
}

/**
 * Path to the system-level regression spec (lives in the demo2project repo,
 * not the target). It is the assertion library + accumulated case index.
 */
export function regressionSpecPath(systemRoot: string): string {
  return path.join(systemRoot, 'qa', 'specs', 'qa-regression.spec.json');
}

export function isInsideDir(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Resolve to absolute, normalized form for safe comparison.
 */
export function abs(p: string): string {
  return path.resolve(p);
}
