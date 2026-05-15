import type { AdvisoryAgentRole, AdvisoryReport } from '../../core/types.js';
import type { AdvisoryProvider, AdvisoryRequest } from './AdvisoryProvider.js';
import { normalizeAdvisoryReport } from './AdvisoryProvider.js';

export class ModelAdvisoryAgent {
  constructor(private provider: AdvisoryProvider) {}

  async run(role: AdvisoryAgentRole, input: Omit<AdvisoryRequest, 'role'>): Promise<AdvisoryReport> {
    const report = await this.provider.runAdvisory({ ...input, role });
    return normalizeAdvisoryReport(report, {
      role,
      provider: this.provider.name,
      model: this.provider.model,
    });
  }

  async runMany(
    roles: AdvisoryAgentRole[],
    input: Omit<AdvisoryRequest, 'role'>,
  ): Promise<AdvisoryReport[]> {
    const reports: AdvisoryReport[] = [];
    for (const role of roles) {
      reports.push(await this.run(role, input));
    }
    return reports;
  }
}
