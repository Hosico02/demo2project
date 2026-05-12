// Top-level helpers — duplicates parts of app.js on purpose to flag
// "no clear module boundaries / copy-paste reuse".
const buffer = [];

function add(x) { buffer.push(x); return buffer.length; }

function formatGreeting(name) {
  return 'hello, ' + name + '!';
}

function joinAll(sep) { return buffer.join(sep); }

module.exports = { add, formatGreeting, joinAll };
