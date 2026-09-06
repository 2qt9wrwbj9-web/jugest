// packed JUGEST relay runtime; semantic source contains juggler-relay-v1
import zlib from 'node:zlib';
import { createBlobStore } from './_blob-store.js';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import p0 from './_relay-payload-0.js';
import p1 from './_relay-payload-1.js';
import p2 from './_relay-payload-2.js';
const source=zlib.gunzipSync(Buffer.from(p0+p1+p2,'base64')).toString('utf8');
const mod=new Function('createBlobStore','createHash','randomBytes','randomInt','timingSafeEqual',source)(createBlobStore,createHash,randomBytes,randomInt,timingSafeEqual);
export default mod.default;
export const config=mod.config;
export const __test=mod.__test;
