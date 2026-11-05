/** Read-only inventory: generated schedules/fixtures must never be promoted as evidence. */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = fileURLToPath(new URL('../../docs/sources/2026-10-31-atlanta-stream-index.json', import.meta.url));
const index = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(JSON.stringify(index.summary, null, 2));
console.log('No registries or fixtures written. Independently verify publisher snapshots before activation.');
