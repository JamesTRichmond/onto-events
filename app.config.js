const { assertReleaseEnvironment, isReleaseBuild } = require('./scripts/release/environment.cjs');

// Expo passes the normalized app.json here, after loading its environment.
// Preserve that manifest verbatim: no secrets or duplicated identity fields.
module.exports = ({ config }) => {
  if (isReleaseBuild(process.env)) {
    assertReleaseEnvironment(process.env);
  }
  return config;
};
