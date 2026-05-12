#!/usr/bin/env node
// A "CLI" with no help, no error handling, no exit codes.
const args = process.argv.slice(2);
if (args[0] === 'hello') console.log('hi');
