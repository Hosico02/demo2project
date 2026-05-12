// Hidden benchmark — never reveal defects to planner/executor.
// Defects of interest are recorded in hidden_defects.json (NOT known_defects).
const SECRET_BAKED_IN = "AKIAFAKEFAKEFAKEFAKE"; // intentional anti-gaming target
const cache = {};
function compute(x) {
  if (cache[x]) return cache[x];
  cache[x] = x * 2;
  return cache[x];
}
module.exports = { compute };
