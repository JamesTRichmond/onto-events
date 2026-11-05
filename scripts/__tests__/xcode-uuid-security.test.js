const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

// Run the installed Node consumers outside Jest's browser module conditions.
function runNode(source, input) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: root, input, encoding: 'utf8', timeout: 5000,
  });
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
}

describe('SDK54 Xcode UUID compatibility and output bounds', () => {
  test('the installed Expo Xcode consumer resolves the pinned CommonJS UUID package', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    expect(manifest.overrides.xcode.uuid).toBe('11.1.1');
    expect(manifest.overrides.uuid).toBeUndefined();
    const entries = Object.entries(lock.packages).filter(([name]) => name.startsWith('node_modules/') && name.endsWith('/uuid'));
    expect(entries).toHaveLength(1);
    expect(entries[0][1]).toMatchObject({
      version: '11.1.1', resolved: 'https://registry.npmjs.org/uuid/-/uuid-11.1.1.tgz',
    });
    expect(entries[0][1].integrity).toMatch(/^sha512-/);
    runNode(`
      const assert = require('node:assert/strict');
      const { createRequire } = require('node:module');
      const expoRequire = createRequire(require.resolve('@expo/config-plugins/package.json'));
      const xcodeRequire = createRequire(expoRequire.resolve('xcode/lib/pbxProject'));
      assert.equal(expoRequire.resolve('xcode'), require.resolve('xcode'));
      assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
      assert.match(xcodeRequire.resolve('uuid'), /[\\/]dist[\\/]cjs[\\/]index\.js$/);
      const uuid = xcodeRequire('uuid');
      const value = uuid.v4();
      assert.equal(uuid.validate(value), true);
      assert.equal(uuid.version(value), 4);
    `);
  });

  test('Xcode generates unique identifiers and Expo group changes survive a project round trip', () => {
    runNode(`
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const xcode = require('xcode');
      const { IOSConfig } = require('@expo/config-plugins');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-xcode-uuid-test-'));
      const filename = path.join(directory, 'project.pbxproj');
      try {
        fs.writeFileSync(filename, '// !$*UTF8*$!\\n{\\n' +
          'archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\\n' +
          '/* Begin PBXGroup section */\\n' +
          'A00000000000000000000001 = { isa = PBXGroup; children = (); sourceTree = "<group>"; };\\n' +
          '/* End PBXGroup section */\\n/* Begin PBXProject section */\\n' +
          'A00000000000000000000002 = { isa = PBXProject; mainGroup = A00000000000000000000001; targets = (); };\\n' +
          '/* End PBXProject section */\\n}; rootObject = A00000000000000000000002;\\n}\\n');
        const project = xcode.project(filename).parseSync();
        const identifiers = new Set(project.allUuids());
        for (let i = 0; i < 10000; i++) {
          const identifier = project.generateUuid();
          assert.match(identifier, /^[A-F0-9]{24}$/);
          assert.equal(identifiers.has(identifier), false);
          identifiers.add(identifier);
        }
        const group = IOSConfig.XcodeUtils.ensureGroupRecursively(project, 'onto/Vermont');
        assert.equal(group.name, 'Vermont');
        const groupIds = project.allUuids().sort();
        assert.equal(groupIds.length, 4);
        assert.equal(new Set(groupIds).size, groupIds.length);
        fs.writeFileSync(filename, project.writeSync());
        const reparsed = xcode.project(filename).parseSync();
        assert.deepEqual(reparsed.allUuids().sort(), groupIds);
        // Parsing uses null-prototype maps; newly added groups use plain objects.
        assert.deepEqual(JSON.parse(JSON.stringify(reparsed.hash)), JSON.parse(JSON.stringify(project.hash)));
        assert.equal(IOSConfig.XcodeUtils.ensureGroupRecursively(reparsed, 'onto/Vermont').name, 'Vermont');
        assert.deepEqual(reparsed.allUuids().sort(), groupIds);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    `);
  });

  test.each(['v3', 'v5', 'v6'])('%s rejects invalid output bounds before changing the caller buffer', (method) => {
    runNode(`
      const assert = require('node:assert/strict');
      const { createRequire } = require('node:module');
      const xcodeRequire = createRequire(require.resolve('xcode/lib/pbxProject'));
      const uuid = xcodeRequire('uuid');
      const method = require('node:fs').readFileSync(0, 'utf8');
      const generate = (buffer, offset) => method === 'v6'
        ? uuid.v6({ msecs: 0, nsecs: 0, clockseq: 0, node: [1, 2, 3, 4, 5, 6] }, buffer, offset)
        : uuid[method]('onto Vermont', uuid[method].DNS, buffer, offset);
      for (const allocate of [length => Buffer.alloc(length, 0xaa), length => new Uint8Array(length).fill(0xaa)]) {
        for (const [length, offset] of [[0, 0], [8, 4], [16, -1], [16, 1], [32, 17], [32, -16]]) {
          const buffer = allocate(length);
          const before = Array.from(buffer);
          assert.throws(() => generate(buffer, offset), RangeError);
          assert.deepEqual(Array.from(buffer), before);
        }
        for (const [length, offset] of [[16, 0], [32, 16]]) {
          const buffer = allocate(length);
          assert.equal(generate(buffer, offset), buffer);
          assert.equal(uuid.version(uuid.stringify(buffer, offset)), Number(method.slice(1)));
          assert.deepEqual(Array.from(buffer.slice(0, offset)), Array(offset).fill(0xaa));
        }
      }
    `, method);
  });
});
