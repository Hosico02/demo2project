import type {
  ProjectSnapshot,
  ProjectScore,
  GapReport,
  ProjectStandard,
} from '../core/types.js';
import { takeSnapshot } from '../core/projectSnapshot.js';
import { scoreProject } from '../core/projectScorer.js';
import { analyzeGaps } from '../core/gapAnalyzer.js';
import { DEFAULT_PROJECT_STANDARD } from '../standards/defaultProjectStandard.js';

export class AnalyzerAgent {
  constructor(private standard: ProjectStandard = DEFAULT_PROJECT_STANDARD) {}

  async snapshot(projectPath: string): Promise<ProjectSnapshot> {
    return takeSnapshot(projectPath);
  }

  async score(snapshot: ProjectSnapshot): Promise<ProjectScore> {
    return scoreProject(snapshot, this.standard);
  }

  async gap(snapshot: ProjectSnapshot, score: ProjectScore): Promise<GapReport> {
    return analyzeGaps(snapshot, score, this.standard);
  }

  async fullAnalyze(projectPath: string): Promise<{
    snapshot: ProjectSnapshot;
    score: ProjectScore;
    gap: GapReport;
  }> {
    const snap = await this.snapshot(projectPath);
    const score = await this.score(snap);
    const gap = await this.gap(snap, score);
    return { snapshot: snap, score, gap };
  }
}
