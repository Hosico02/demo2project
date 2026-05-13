import { Demo2ProjectClient } from '../../src/sdk/index.js';

const client = new Demo2ProjectClient({
  projectPath: process.argv[2] ?? './examples/bad-demo',
  profile: 'conservative',
});

const a = await client.analyze();
console.log(JSON.stringify(a, null, 2));
const gap = await client.gap();
console.log(JSON.stringify({ findings: gap.findings.length, blockers: gap.blockers.length }, null, 2));
