import { Demo2ProjectClient } from '../../src/sdk/index.js';

const client = new Demo2ProjectClient({ projectPath: process.argv[2] });
console.log(JSON.stringify(await client.security.trustReport(), null, 2));
