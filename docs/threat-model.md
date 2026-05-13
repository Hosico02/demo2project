# Threat model

The catalog of 20 named threats lives in [`src/security/ThreatCatalog.ts`](../src/security/ThreatCatalog.ts).
A risk score is computed per threat by `RiskScorer.ts` and aggregated by `ThreatModel.ts`.

## Categories

| Category | Example threats |
|---|---|
| malicious_repository | T001 install scripts in unknown repo |
| prompt_injection | T002 README tells executor to skip verification |
| secret_exfiltration | T003 secrets persisted in replay bundle |
| unsafe_command_execution | T004 rm -rf / via task description |
| path_traversal | T005 ../../etc/passwd |
| unauthorized_file_access | T006 reading .env |
| dependency_supply_chain | T007 typo-squat package |
| install_script_risk | T008 postinstall lifecycle abuse |
| malicious_test_or_build_script | T009 curl/nc inside test |
| qa_memory_poisoning | T010 fake QA cases |
| evidence_log_tampering | T011 silent edit of audit log |
| self_modification_abuse | T012 self-iteration touches safety.ts |
| approval_bypass | T013 direct write skipping ApprovalWorkflow |
| plugin_or_mcp_risk | T014 MCP server requests fs/network |
| network_exfiltration | T015 upload logs to evil URL |
| data_retention_risk | T016 indefinite log growth |
| executor_misreporting | T017 model claims success without evidence |
| score_gaming | T018 empty test / echo build |
| rollback_failure | T019 lost base_commit |
| policy_downgrade_attack | T020 config edit weakens policy |

## CLI

```bash
pnpm demo2project security:threat-model
pnpm demo2project security:threat --id T011
```

Report is written to `reports/security/threat-model.{json,md}`.
