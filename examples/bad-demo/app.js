// Deliberately rough demo entrypoint. Mixed concerns; no error handling.
const items = [];

function add(x) { items.push(x); return items.length; }

// HTTP-ish formatting inlined here for "convenience"
function formatGreeting(name) {
  return 'hello, ' + name + '!';
}

// File-ish helpers also inlined, copy-pasted in helpers.js (intentional dup)
function joinAll(sep) { return items.join(sep); }

function main() {
  add(formatGreeting('world'));
  add(formatGreeting('alice'));
  console.log(joinAll(' | '));
}

main();
