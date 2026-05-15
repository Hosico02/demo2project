import type { AdvisoryFinding, AdvisoryReport, AdvisoryTaskProposal } from '../../core/types.js';
import type { AdvisoryProvider, AdvisoryRequest } from './AdvisoryProvider.js';
import { normalizeAdvisoryReport } from './AdvisoryProvider.js';

export interface MockAdvisoryProviderInput {
  findings?: AdvisoryFinding[];
  task_proposals?: AdvisoryTaskProposal[];
  risks?: string[];
  raw_summary?: string;
  onRequest?: (request: AdvisoryRequest) => void;
}

export class MockAdvisoryProvider implements AdvisoryProvider {
  readonly name = 'mock-advisory';
  readonly model = 'mock';

  constructor(private input: MockAdvisoryProviderInput = {}) {}

  async runAdvisory(request: AdvisoryRequest): Promise<AdvisoryReport> {
    this.input.onRequest?.(request);
    return normalizeAdvisoryReport(
      {
        role: request.role,
        provider: this.name,
        model: this.model,
        findings: this.input.findings ?? [],
        task_proposals: this.input.task_proposals ?? [],
        risks: this.input.risks ?? [],
        raw_summary: this.input.raw_summary ?? 'mock advisory report',
      },
      { role: request.role, provider: this.name, model: this.model },
    );
  }
}
