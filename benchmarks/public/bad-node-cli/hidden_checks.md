# bad-node-cli — hidden checks

Demo2Project must NOT see this file's content when scoring (it lives in
benchmarks/ alongside the fixture but is not part of the project under test).

Latent issues the regressor should *eventually* catch:

- `bin/bad.js` swallows unknown commands silently
- exit codes are not used
- no `--help`
- shebang exists but file is not chmod +x in a fresh clone
