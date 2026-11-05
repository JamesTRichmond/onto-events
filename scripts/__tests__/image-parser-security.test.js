const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const imageSize = require('image-size');
const metroAssets = require('metro/private/Assets');

const root = path.resolve(__dirname, '../..');
const icon = path.join(root, 'assets/images/icon.png');
const png = fs.readFileSync(icon);

function box(type, payload) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 'ascii');
  payload.copy(result, 8);
  return result;
}

function heif(badLength) {
  const ispe = box('ispe', Buffer.alloc(12));
  ispe.writeUInt32BE(640, 12);
  ispe.writeUInt32BE(360, 16);
  if (badLength !== undefined) ispe.writeUInt32BE(badLength, 0);
  return Buffer.concat([
    box('ftyp', Buffer.from('heic\0\0\0\0', 'ascii')),
    box('meta', Buffer.concat([Buffer.alloc(4), box('iprp', box('ipco', ispe))])),
  ]);
}

function icns(badLength) {
  // ICNS entries put the type before the length; ISO image boxes do the reverse.
  const entry = Buffer.alloc(8);
  entry.write('icp4', 0, 'ascii');
  entry.writeUInt32BE(badLength === undefined ? entry.length : badLength, 4);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + entry.length, 4);
  return Buffer.concat([header, entry]);
}

function jxl(badLength) {
  const partial = box('jxlp', Buffer.alloc(4));
  partial.writeUInt32BE(badLength, 0);
  return Buffer.concat([
    box('JXL ', Buffer.from([13, 10, 135, 10])),
    box('ftyp', Buffer.from('jxl \0\0\0\0jxl ', 'ascii')),
    partial,
  ]);
}

describe('SDK54 image parser security and Metro compatibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    imageSize.disableFS(false);
    imageSize.disableTypes([]);
    imageSize.setConcurrency(100);
  });

  test('the actual Metro consumer resolves the compatibility wrapper and pinned fixed parser', () => {
    const metroRoot = path.dirname(require.resolve('metro/package.json'));
    expect(require.resolve('image-size', { paths: [metroRoot] })).toBe(require.resolve('image-size'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    const parser = lock.packages['node_modules/image-size-parser'];
    expect(parser.version).toBe('2.0.3');
    expect(parser.resolved).toBe('https://registry.npmjs.org/image-size/-/image-size-2.0.3.tgz');
    expect(parser.integrity).toMatch(/^sha512-/);
    expect(Object.entries(lock.packages).filter(([name]) => name.startsWith('node_modules/') && name.endsWith('/image-size')).every(([, entry]) => entry.link)).toBe(true);
  });

  test('Metro reads both buffers and filenames for the current app icon', async () => {
    const expected = imageSize(png);
    expect(metroAssets.getAssetSize('png', png, icon)).toEqual({ width: expected.width, height: expected.height });
    const asset = await metroAssets.getAssetData(icon, 'assets/images/icon.png', [], 'ios', '/assets');
    expect(asset.width).toBe(expected.width);
    expect(asset.height).toBe(expected.height);
    expect(asset.files).toContain(icon);
  });

  test.each([
    'assets/images/icon.png', 'assets/images/splash-icon.png',
    'assets/images/favicon.png', 'assets/images/android-icon-foreground.png',
    'assets/images/android-icon-background.png', 'assets/images/android-icon-monochrome.png',
    'assets/brand/logo-onto-navy.png', 'assets/brand/logo-onto-navy-square.png',
    'assets/brand/onto-mark.svg', 'assets/brand/onto-mark.legacy.svg',
  ])('preserves buffer/filename dimensions for committed asset %s', relative => {
    const filename = path.join(root, relative);
    const expected = imageSize(fs.readFileSync(filename));
    expect(imageSize(filename)).toEqual(expected);
    expect(expected.width).toBeGreaterThan(0);
    expect(expected.height).toBeGreaterThan(0);
  });

  test('returns correct dimensions for valid HEIF and ICNS container headers', () => {
    expect(icns().toString('hex')).toBe('69636e73000000106963703400000008');
    expect(imageSize(heif())).toMatchObject({ width: 640, height: 360, type: 'heic' });
    expect(imageSize(icns())).toMatchObject({ width: 16, height: 16, type: 'icns' });
  });

  test.each([
    ['ICNS zero entry', icns(0)], ['ICNS short entry', icns(4)],
    ['HEIF zero ispe', heif(0)], ['HEIF short ispe', heif(8)],
    ['JXL zero partial box', jxl(0)], ['JXL short partial box', jxl(8)],
  ])('rejects %s without hanging, through buffer and filename APIs', (_name, bytes) => {
    const result = spawnSync(process.execPath, ['--max-old-space-size=64', '-e', `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const imageSize = require('image-size');
      const input = Buffer.from(fs.readFileSync(0, 'utf8'), 'hex');
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-image-parser-test-'));
      try {
        assert.throws(() => imageSize(input));
        const filename = path.join(directory, 'bad-image');
        fs.writeFileSync(filename, input);
        assert.throws(() => imageSize(filename));
      } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    `], { cwd: root, input: bytes.toString('hex'), encoding: 'utf8', timeout: 3000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('invokes filename callbacks after returning, once, including read failures', async () => {
    let returned = false;
    const done = new Promise((resolve, reject) => {
      imageSize(icon, (error, size) => {
        try {
          expect(returned).toBe(true);
          expect(error).toBeNull();
          expect(size).toEqual(imageSize(png));
          resolve();
        } catch (failure) { reject(failure); }
      });
    });
    returned = true;
    await done;
    await new Promise((resolve, reject) => imageSize(path.join(root, 'assets/missing-parser-test-file'), (error, size) => {
      try { expect(error.code).toBe('ENOENT'); expect(size).toBeUndefined(); resolve(); }
      catch (failure) { reject(failure); }
    }));
  });

  test('honors filesystem/type disable controls without coercing invalid inputs', () => {
    imageSize.disableFS(true);
    expect(() => imageSize(icon)).toThrow(TypeError);
    expect(imageSize(png).type).toBe('png');
    imageSize.disableFS(false);
    imageSize.disableTypes(['png']);
    expect(() => imageSize(png)).toThrow(/disabled file type/);
    expect(() => imageSize(icon)).toThrow(/disabled file type/);
    const object = { toString: jest.fn(() => icon) };
    expect(() => imageSize(object)).toThrow(TypeError);
    expect(object.toString).not.toHaveBeenCalled();
    for (const value of [0, -1, 1.5, Infinity]) expect(() => imageSize.setConcurrency(value)).toThrow(TypeError);
  });

  test('bounds file reads, handles short reads and closes a descriptor on read failure', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'onto-image-prefix-test-'));
    try {
      const filename = path.join(directory, 'large image.png');
      fs.writeFileSync(filename, Buffer.concat([png, Buffer.alloc(1024 * 1024)]));
      const original = fs.readSync;
      const read = jest.spyOn(fs, 'readSync').mockImplementation((fd, buffer, offset, length, position) => {
        expect(buffer.byteLength).toBeLessThanOrEqual(512 * 1024);
        return original(fd, buffer, offset, Math.min(length, 4096), position);
      });
      expect(imageSize(filename)).toEqual(imageSize(png));
      expect(read.mock.calls.length).toBeGreaterThan(1);
      read.mockImplementation(() => { throw new Error('test read failure'); });
      const close = jest.spyOn(fs, 'closeSync');
      expect(() => imageSize(filename)).toThrow('test read failure');
      expect(close).toHaveBeenCalledTimes(1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
