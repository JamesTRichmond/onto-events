'use strict';

// All format parsing is the unmodified, integrity-pinned upstream 2.0.3.
// SDK54 Metro also passes filenames; upstream 2 removed that synchronous API.
const fs = require('node:fs');
const path = require('node:path');
const parser = require('image-size-parser');
const fileParser = require('image-size-parser/fromFile');

const MAX_INPUT_BYTES = 512 * 1024;
let disabledFS = false;

function readPrefix(filePath) {
  const descriptor = fs.openSync(path.resolve(filePath), 'r');
  try {
    const { size } = fs.fstatSync(descriptor);
    if (size <= 0) throw new Error('Empty file');
    const input = new Uint8Array(Math.min(size, MAX_INPUT_BYTES));
    // A short read must not introduce zero-filled bytes into an image header.
    let used = 0;
    while (used < input.length) {
      const count = fs.readSync(descriptor, input, used, input.length - used, used);
      if (count === 0) break;
      used += count;
    }
    return input.subarray(0, used);
  } finally {
    fs.closeSync(descriptor);
  }
}

function imageSize(input, callback) {
  if (input instanceof Uint8Array) return parser.imageSize(input);
  if (typeof input !== 'string' || disabledFS) {
    throw new TypeError('invalid invocation. input should be a Uint8Array');
  }
  if (typeof callback === 'function') {
    fileParser.imageSizeFromFile(input).then(
      value => process.nextTick(callback, null, value),
      error => process.nextTick(callback, error),
    );
    return;
  }
  return parser.imageSize(readPrefix(input));
}

module.exports = imageSize;
imageSize.default = imageSize;
imageSize.imageSize = imageSize;
imageSize.types = parser.types;
imageSize.disableTypes = parser.disableTypes;
imageSize.disableFS = value => { disabledFS = Boolean(value); };
imageSize.setConcurrency = value => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('Concurrency must be a positive safe integer');
  }
  fileParser.setConcurrency(value);
};
