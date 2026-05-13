import path from 'node:path';
import { readTextSafe, listFiles } from '../../utils/fs.js';
import { shortId } from '../../utils/time.js';
import type { PromptInjectionFinding, InjectionCategory } from './PromptInjectionFinding.js';

interface Pattern {
  name: string;
  re: RegExp;
  category: InjectionCategory;
  severity: 'low' | 'medium' | 'high' | 'critical';
  action: string;
}

const PATTERNS: Pattern[] = [
  { name: 'ignore_previous', re: /ignore (the |all |previous |prior )?(rules|instructions|guidance|system prompt)/i, category: 'ignore_previous_rules', severity: 'high', action: 'isolate as untrusted repo content' },
  { name: 'reveal_secrets', re: /(reveal|leak|print|exfiltrate|show me) (the |all |your )?(secret|secrets|api[_\- ]?key|token|password)/i, category: 'leak_secrets', severity: 'critical', action: 'block; trigger incident' },
  { name: 'read_env', re: /(read|open|cat|dump) (the )?\.env/i, category: 'read_env', severity: 'high', action: 'deny file_read on .env' },
  { name: 'dangerous_cmd', re: /(run|execute) `?(rm\s+-rf|sudo|curl[^|]*\|\s*sh|wget[^|]*\|\s*sh|mkfs|dd\s+if=)/i, category: 'execute_dangerous_command', severity: 'critical', action: 'block; trigger incident' },
  { name: 'disable_tests', re: /(skip|disable|turn off|bypass) (the )?(tests?|verification|hooks?|gate)/i, category: 'disable_verification', severity: 'high', action: 'never mutate verification gate' },
  { name: 'modify_policy', re: /(modify|edit|update|weaken|disable) (the )?(security policy|approval policy|autonomy policy)/i, category: 'modify_security_policy', severity: 'critical', action: 'block via forbidden_self_modifications' },
  { name: 'skip_approval', re: /(skip|bypass|ignore) (the )?(approval|review|human in the loop)/i, category: 'skip_approval', severity: 'high', action: 'never bypass approval' },
  { name: 'exfil_system_prompt', re: /(print|write|save|reveal) (your |the )?system prompt/i, category: 'exfil_system_prompt', severity: 'high', action: 'sanitize before passing context' },
  { name: 'upload_logs', re: /(upload|send|post) (the )?(logs?|events?|qa cases) to (https?:|ftp:)/i, category: 'upload_logs', severity: 'high', action: 'block network_access' },
  { name: 'install_mcp', re: /(install|enable|add) (an? )?(mcp|plugin|extension)/i, category: 'install_unknown_mcp', severity: 'medium', action: 'require approval' },
  { name: 'clear_qa', re: /(clear|delete|wipe|reset) (the )?qa (memory|cases|store)/i, category: 'clear_qa_memory', severity: 'high', action: 'never auto-clear QA memory' },
  { name: 'fake_verify', re: /(fake|fabricate|forge|invent) (the )?(verification|test results?)/i, category: 'fabricate_verification', severity: 'critical', action: 'block; trigger incident' },
  { name: 'mark_complete', re: /(mark|set|flag) (this |the task )?(as )?(completed?|done) (without|despite|even if)/i, category: 'mark_unverified_complete', severity: 'high', action: 'verification gate prevents this' },
];

const SCAN_EXT = ['.md', '.txt', '.rst', '.adoc', '.py', '.ts', '.tsx', '.js', '.jsx', '.json', '.yaml', '.yml', '.sh', 'Makefile', '.env.example'];

function shouldScan(rel: string): boolean {
  const base = path.basename(rel);
  if (base === 'Makefile' || base.startsWith('README')) return true;
  return SCAN_EXT.some((ext) => rel.endsWith(ext));
}

export interface ScanReport {
  project_path: string;
  files_scanned: number;
  findings: PromptInjectionFinding[];
  highest_severity: 'low' | 'medium' | 'high' | 'critical' | 'none';
}

export async function scanProject(projectPath: string, maxFiles = 500): Promise<ScanReport> {
  const all = await listFiles(projectPath, maxFiles);
  const targets = all.filter(shouldScan);
  const findings: PromptInjectionFinding[] = [];
  for (const rel of targets) {
    const txt = await readTextSafe(path.join(projectPath, rel));
    if (!txt) continue;
    const lines = txt.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const p of PATTERNS) {
        if (p.re.test(line)) {
          findings.push({
            id: shortId('pi'),
            category: p.category,
            severity: p.severity,
            file: rel,
            line: i + 1,
            snippet: line.slice(0, 200),
            pattern_name: p.name,
            recommended_action: p.action,
          });
        }
      }
    }
  }
  let highest: ScanReport['highest_severity'] = 'none';
  const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 } as const;
  for (const f of findings) {
    if (order[f.severity] > order[highest]) highest = f.severity;
  }
  return { project_path: projectPath, files_scanned: targets.length, findings, highest_severity: highest };
}

export function explain(finding: PromptInjectionFinding): {
  finding: PromptInjectionFinding;
  why_dangerous: string;
  mitigation: string;
} {
  const reasons: Record<InjectionCategory, string> = {
    ignore_previous_rules: 'Tells the model to disregard the system prompt — repo content must never override system policy.',
    leak_secrets: 'Asks for secrets to be exposed; would defeat redaction.',
    read_env: 'Targets .env which holds credentials.',
    execute_dangerous_command: 'Requests a destructive shell command.',
    disable_verification: 'Tries to disable the verification gate — gate is on forbidden list.',
    modify_security_policy: 'Tries to weaken the security policy — also on forbidden list.',
    skip_approval: 'Tries to bypass human approval workflow.',
    exfil_system_prompt: 'Wants to capture the system prompt for replay/abuse.',
    upload_logs: 'Wants to send sensitive data offsite.',
    install_unknown_mcp: 'Wants to expand executor capability via plugin.',
    clear_qa_memory: 'Wants to wipe accumulated QA learning.',
    fabricate_verification: 'Wants to forge passing test results.',
    mark_unverified_complete: 'Wants to mark a task done without evidence.',
  };
  return {
    finding,
    why_dangerous: reasons[finding.category],
    mitigation: finding.recommended_action,
  };
}
