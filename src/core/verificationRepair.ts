import type { AgentResult, AgentTask } from './types.js';
import { shortId } from '../utils/time.js';

export function buildVerificationRepairTask(
  failedTask: AgentTask,
  result: AgentResult,
): AgentTask | null {
  const failedEvidence = result.verification_evidence.find((e) => !e.passed);
  if (!failedEvidence) return null;
  const related = Array.from(new Set([
    ...result.changed_files,
    ...failedTask.expected_changed_files.filter((f) => f !== '(see suggested_fix)'),
    ...extractPaths(`${failedEvidence.stdout_summary}\n${failedEvidence.stderr_summary}`),
  ])).slice(0, 12);

  return {
    id: shortId('task_repair'),
    iteration_id: failedTask.iteration_id,
    assigned_to: 'executor',
    title: `Repair failed verification: ${failedEvidence.command}`,
    description: [
      `Previous task failed verification: ${failedTask.title}`,
      `Failed command: ${failedEvidence.command}`,
      `Failure reason: ${failedEvidence.failure_reason ?? 'non-zero exit'}`,
      'Fix the root cause of the failed verification before doing any unrelated productization work.',
      '',
      'Verification output:',
      truncate(`${failedEvidence.stdout_summary}\n${failedEvidence.stderr_summary}`, 3000),
    ].join('\n'),
    acceptance_criteria: [
      'the failed verification command exits 0',
      'the fix addresses the root cause rather than weakening or deleting tests',
      'no unrelated productization work is bundled into the repair',
    ],
    expected_changed_files: related.length > 0 ? related : failedTask.expected_changed_files,
    verification_commands: [failedEvidence.command],
    priority: 'blocker',
    status: 'pending',
  };
}

function extractPaths(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:^|[\s("'`])([A-Za-z0-9_./-]+\.(?:py|js|ts|tsx|jsx|json|toml|md|yml|yaml|txt|html|css|sh))(?::\d+)?/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rel = match[1]?.replace(/^\.\//, '');
    if (rel && !rel.startsWith('/') && !rel.includes('..')) out.add(rel);
  }
  return Array.from(out);
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + `\n... [truncated, original ${text.length} chars]` : text;
}
