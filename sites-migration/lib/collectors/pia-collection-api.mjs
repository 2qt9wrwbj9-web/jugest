import {timingSafeEqual} from 'node:crypto';
import {sha256Text} from '../storage/recovery.mjs';
import {runPiaCollectionTick} from './pia-collection.mjs';

const reply = (payload, status) => Response.json(payload, {
  status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'},
});

export async function handlePiaCollection(request, {
  db, bucket, enabled = false, writerHash, run = runPiaCollectionTick,
} = {}) {
  if (!enabled || !/^[a-f0-9]{64}$/.test(writerHash ?? '')) return reply({ok: false, code: 'pia_writer_disabled'}, 404);
  if (request.method !== 'POST') return reply({ok: false, code: 'method_not_allowed'}, 405);
  const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '');
  const encoder = new TextEncoder();
  if (!match || !timingSafeEqual(encoder.encode(await sha256Text(match[1])), encoder.encode(writerHash))) {
    return reply({ok: false, code: 'pia_writer_unauthorized'}, 401);
  }
  // The caller cannot choose a source, store, day, or response payload.
  if (request.body) return reply({ok: false, code: 'pia_writer_unexpected_body'}, 400);
  try {
    const result = await run({db, bucket, enabled: true});
    const ok = !['failed', 'access_denied'].includes(result.status ?? result.reason);
    return reply({ok, ...result}, ok ? 200 : result.error === 'pia_rate_limited' ? 429 : 502);
  } catch {
    // A write whose outcome is uncertain can be retried after its lease expires.
    return reply({ok: false, code: 'pia_collection_unconfirmed'}, 503);
  }
}
