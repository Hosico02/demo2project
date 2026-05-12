# Privacy & redaction

`src/core/redaction.ts` masks the following before anything is persisted:

- env-style `API_KEY=…` / `password=…` / `database_url=…` / `smtp_password=…`
- JSON-style `"token": "…"`
- `Authorization: Bearer …`
- AWS access key id (`AKIA…`)
- GitHub PAT (`ghp_…`, `gho_…`, `ghu_…`, `ghs_…`, `ghr_…`)
- Anthropic key shape (`sk-ant-…`)
- OpenAI key shape (`sk-…`)
- PEM private key blocks
- **Email addresses**
- **`/Users/<name>` and `/home/<name>` absolute paths** (Phase 5)
- **IPv4 addresses** (Phase 5)
- **Database connection URLs** — `postgres://`, `mysql://`, `mongodb://`, `redis://` (Phase 5)

## Test it

```bash
demo2project redact:test --input ./some-log.txt
demo2project redact:test --sample "secret AKIAABCDEFGHIJKLMNOP at mack@example.com from 10.0.1.5"
```

## What redaction does NOT cover

- Private GitHub organisation names (no reliable pattern)
- Hostnames (`*.internal`, `*.local`) — we redact IPs but not arbitrary hostnames
- Free-form natural language that mentions sensitive info — humans must review
- Binary files / encoded blobs — we only operate on text

## Anonymization layer (corpus)

Beyond redaction, corpus entries also use:

- `path_hash` = sha256(absolute path) → first 12 chars
- The visible `path` field IS redacted but should be treated as
  identifying — never share corpus files publicly without re-reviewing.
