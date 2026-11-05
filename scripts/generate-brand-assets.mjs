// onto brand-asset generator: renders the icon set from the master mark below.
// The mark: a ring (a place, an "o") with an arrow flying IN through a gap at
// the upper right to land inside. The outward arrow was drawn
// first and scrapped: circle plus outbound up-and-right arrow is the Mars
// symbol. Night indigo ground, white ring, coral arrow.
//
// Run: npm exec --yes --package=sharp -- node scripts/generate-brand-assets.mjs
// (sharp is intentionally NOT a project dependency — native binaries stay out
// of the app's tree; this script runs rarely, when the brand changes.)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp not found. Run: npm exec --yes --package=sharp -- node scripts/generate-brand-assets.mjs');
  process.exit(1);
}

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const INDIGO = '#171A34';
const CORAL = '#FF6B4A';
const WHITE = '#FFFFFF';

// Master mark geometry on a 1024 canvas: an open ring (a place, an "o") with
// a gap at the upper right, and an arrow flying in through the gap to land
// inside. Deliberately NOT the outward arrow: circle plus
// outbound up-right arrow is the Mars/male symbol, which this app must not
// wear. The bounding box is centered via the translate.
function mark({ ring = WHITE, arrow = CORAL, scale = 1 } = {}) {
  return `
  <g transform="translate(512,512) scale(${scale}) translate(-510,-531)">
    <path d="M 480.4 390 A 204 204 0 1 0 654 563.6" fill="none" stroke="${ring}" stroke-width="86" stroke-linecap="round"/>
    <line x1="780" y1="260" x2="525" y2="515" stroke="${arrow}" stroke-width="72" stroke-linecap="round"/>
    <polyline points="495,415 495,545 625,545" fill="none" stroke="${arrow}" stroke-width="72" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

const svg = (body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">${body}</svg>`;

// Full-bleed app icon (iOS masks its own corners; no transparency).
const iconSvg = svg(`<rect width="1024" height="1024" fill="${INDIGO}"/>${mark()}`);

// Android adaptive icon: foreground content must sit in the middle ~66% safe zone.
const foregroundSvg = svg(mark({ scale: 0.58 }));
const backgroundSvg = svg(`<rect width="1024" height="1024" fill="${INDIGO}"/>`);
const monochromeSvg = svg(mark({ ring: WHITE, arrow: WHITE, scale: 0.58 }));

// Splash + favicon: a rounded badge tile so the mark reads on the white light
// splash and the black dark splash alike.
const badgeSvg = svg(
  `<rect width="1024" height="1024" rx="232" fill="${INDIGO}"/>${mark({ scale: 0.78 })}`
);

const jobs = [
  ['icon.png', iconSvg, 1024],
  ['android-icon-foreground.png', foregroundSvg, 1024],
  ['android-icon-background.png', backgroundSvg, 1024],
  ['android-icon-monochrome.png', monochromeSvg, 1024],
  ['splash-icon.png', badgeSvg, 512],
  ['favicon.png', badgeSvg, 64],
];

fs.writeFileSync(
  path.join(OUT, '..', 'brand', 'onto-mark.svg'),
  svg(`<rect width="1024" height="1024" fill="${INDIGO}"/>${mark()}`)
);

for (const [name, source, size] of jobs) {
  const png = await sharp(Buffer.from(source)).resize(size, size).png().toBuffer();
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}
