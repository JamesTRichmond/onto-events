'use strict';

// Upstream v0.5.0's fixed scanner, with a CommonJS export and the v0.2.2
// literal-plus convention. See README.md and the adjacent MIT license.
const token = '%[a-f0-9]{2}';
const multiMatcher = new RegExp(`(${token})+`, 'gi');
const hexPair = /^[a-f\d]{2}$/i;
const MAX_MALFORMED_FALLBACK_LENGTH = 8192;

function parsePercentByte(input, position) {
  if (input.codePointAt(position) !== 37 || position + 3 > input.length) {
    return;
  }
  const digits = input.slice(position + 1, position + 3);
  if (!hexPair.test(digits)) {
    return;
  }
  return { byte: Number.parseInt(digits, 16), next: position + 3 };
}

function utf8SequenceLength(byte) {
  if (byte <= 0x7F) return 1;
  if (byte >= 0xC2 && byte <= 0xDF) return 2;
  if (byte >= 0xE0 && byte <= 0xEF) return 3;
  if (byte >= 0xF0 && byte <= 0xF4) return 4;
  return 0;
}

function isContinuationByte(byte) {
  return byte >= 0x80 && byte <= 0xBF;
}

// Decode valid UTF-8 left-to-right; emit malformed bytes literally.
function decode(input) {
  try {
    return decodeURIComponent(input);
  } catch {
    let output = '';
    let position = 0;
    while (position < input.length) {
      if (input.codePointAt(position) !== 37) {
        output += input.charAt(position);
        position++;
        continue;
      }
      const firstByte = parsePercentByte(input, position);
      if (!firstByte) {
        output += input.charAt(position);
        position++;
        continue;
      }
      const sequenceLength = utf8SequenceLength(firstByte.byte);
      if (sequenceLength === 0) {
        output += input.slice(position, position + 3);
        position += 3;
        continue;
      }
      let end = firstByte.next;
      let validSequence = true;
      for (let index = 1; index < sequenceLength; index++) {
        const nextByte = parsePercentByte(input, end);
        if (!nextByte || !isContinuationByte(nextByte.byte)) {
          validSequence = false;
          break;
        }
        end = nextByte.next;
      }
      if (validSequence) {
        try {
          output += decodeURIComponent(input.slice(position, end));
          position = end;
          continue;
        } catch {
          // Correct byte structure can still represent invalid UTF-8.
        }
      }
      output += input.slice(position, position + 3);
      position += 3;
    }
    return output;
  }
}

function customDecodeURIComponent(input) {
  const replaceMap = {
    '%FE%FF': '\uFFFD\uFFFD',
    '%FF%FE': '\uFFFD\uFFFD',
  };
  let match = multiMatcher.exec(input);
  while (match) {
    try {
      replaceMap[match[0]] = decodeURIComponent(match[0]);
    } catch {
      const result = decode(match[0]);
      if (result !== match[0]) {
        replaceMap[match[0]] = result;
      }
    }
    match = multiMatcher.exec(input);
  }
  replaceMap['%C2'] = '\uFFFD';
  for (const key of Object.keys(replaceMap)) {
    input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
  }
  return input;
}

module.exports = function decodeUriComponent(encodedURI) {
  if (typeof encodedURI !== 'string') {
    throw new TypeError(`Expected \`encodedURI\` to be of type \`string\`, got \`${typeof encodedURI}\``);
  }
  encodedURI = encodedURI.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(encodedURI);
  } catch {
    // The retained replacement pass can revisit many distinct malformed runs.
    // Keep oversized invalid components literal rather than amplify their work.
    if (encodedURI.length > MAX_MALFORMED_FALLBACK_LENGTH) return encodedURI;
    return customDecodeURIComponent(encodedURI);
  }
};
