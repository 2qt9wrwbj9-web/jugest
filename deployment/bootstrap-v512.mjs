import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(here, 'v512-public');
const chunks = fs.readdirSync(payloadDir)
  .filter((name) => /^payload-\d+\.txt$/.test(name))
  .sort();
if (!chunks.length) throw new Error('JUGEST v5.1.2 public payload chunks are missing');
const encoded = chunks.map((name) => fs.readFileSync(path.join(payloadDir, name), 'utf8').trim()).join('');
const compressed = Buffer.from(encoded, 'base64');
const payload = JSON.parse(zlib.gunzipSync(compressed).toString('utf8'));
for (const [rel, b64] of Object.entries(payload)) {
  const target = path.join(process.cwd(), 'public', rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(b64, 'base64'));
}
console.log(`JUGEST v5.1.2 public runtime restored: ${Object.keys(payload).length} files`);
