# Governance decision log

Append-only JSONL log of every autonomous decision the controller makes.

Decision types: `continue`, `stop`, `rollback`, `request_approval`,
`accept_patch`, `reject_patch`, `promote_qa_case`, `retire_qa_case`,
`update_standard`, `switch_executor`, `reduce_scope`, `self_improve_accept`,
`self_improve_reject`.

## Record shape

```jsonc
{
  "decision_id": "dec_xxx",
  "session_id": "sess_xxx",
  "iteration_id": "iter_xxx",
  "decision_type": "stop",
  "options_considered": ["continue", "stop", "rollback"],
  "selected_option": "stop",
  "reason": "plateau: Δscore 0 over last 3 iterations",
  "risk_level": "low",
  "policy_reference": null,
  "evidence_ids": ["score_plateau"],
  "approval_status": "n/a",
  "created_at": "..."
}
```

## CLI

```bash
demo2project governance:log     --project ./path --session <id>
demo2project governance:explain --project ./path --decision <id>
```

Storage: `.demo2project/governance/<session>.jsonl`.
