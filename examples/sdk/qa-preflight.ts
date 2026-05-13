import { Demo2ProjectClient } from '../../src/sdk/index.js';

const client = new Demo2ProjectClient({ projectPath: process.argv[2] ?? './examples/bad-demo' });
console.log(JSON.stringify(await client.qa.preflight(), null, 2));
