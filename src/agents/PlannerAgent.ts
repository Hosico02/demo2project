import type { GapReport, IterationPlan, QACase } from '../core/types.js';
import { planIteration } from '../core/iterationPlanner.js';

export interface PlannerOptions {
  qaCases?: QACase[];
}

export class PlannerAgent {
  plan(gap: GapReport, goal: string, iterationId?: string, opts: PlannerOptions = {}): IterationPlan {
    return planIteration(gap, goal, iterationId, opts);
  }
}
