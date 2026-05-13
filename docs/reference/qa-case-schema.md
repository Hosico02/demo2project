# QA case schema

Stored in `.demo2project/qa-cases.json` per project.

```jsonc
{
  "id": "qa_xxx",
  "title": "short human description",
  "category": "process_failure | verification_failure | executor_failure | ...",
  "severity": "low | medium | high | critical",
  "frequency": 1,
  "status": "active | resolved | archived",
  "project_type": ["generic"],
  "bug_source": { "iteration_id": "iter_...", "agent": "...", "source": "iteration_event", "related_files": [] },
  "trigger_condition": "what conditions reproduce this",
  "human_flow": [ { "step": 1, "actor": "user|supervisor|executor", "action": "..." } ],
  "expected_behavior": "...",
  "actual_failure": "...",
  "regression_assertions": [ "machine-checkable predicate" ],
  "remediation": "what to do once detected",
  "transferability": { "applicable_archetypes": [], "excluded_archetypes": [], "portability_score": 0.6 }
}
```

Cross-project promotions add `applicable_archetypes` and `portability_score`. Promotions require approval.
