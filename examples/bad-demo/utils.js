// Yet another top-level grab-bag — would belong under a single utils/ dir
// in a project-ready layout. Left at the root on purpose.
function unsafeReadEnv(name) {
  // no validation, no fallback
  return process.env[name];
}

function bad_format(s) {
  // inconsistent naming style on purpose
  return ('' + s).toUpperCase();
}

module.exports = { unsafeReadEnv, bad_format };
