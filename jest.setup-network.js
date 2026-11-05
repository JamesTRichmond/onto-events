// No suite reaches the real network: weather, catalog and auth calls that a
// test does not stub fail fast and quietly, the way an offline phone would.
// A test that wants a response assigns its own global.fetch.
globalThis.fetch = () => Promise.reject(new Error('network is off in tests'));
