import {handleStoreRead} from './store-read-api.mjs';

const reply = (code, status) => Response.json({ok: false, code}, {
  status, headers: {'cache-control': 'no-store', 'x-content-type-options': 'nosniff'},
});

// userId comes from Sites' hosted sign-in helper, never from body, query,
// app credentials, or the service access token. Verify the ingress on host.
export function ownerViewAccess({enabled, ownerId, userId}) {
  if (!enabled) return reply('not_found', 404);
  if (!ownerId) return reply('owner_view_not_configured', 503);
  if (!userId) return reply('owner_sign_in_required', 401);
  if (userId !== ownerId) return reply('owner_view_forbidden', 403);
  return null;
}

function canReadPia(metadata, id) {
  return (id === 'pia:35' && metadata.source === 'pia-public-ranking-top') ||
    (/^pia:35:import:[a-z0-9-]{1,32}$/.test(id) &&
      metadata.source === 'authorized-pia-import' && metadata.visibility === 'private');
}

export async function handleOwnerView(request, options) {
  const denied = ownerViewAccess(options);
  if (denied) return denied;
  const path = new URL(request.url).pathname;
  if (path === '/api/owner-view' && request.method === 'GET') {
    return Response.json({ok: true, authenticated: true}, {headers: {'cache-control': 'no-store'}});
  }
  const read = ['GET', 'HEAD'].includes(request.method) &&
    /^\/api\/vps\/stores(?:\/[a-z0-9%:-]+\/(?:status|days(?:\/\d{4}-\d{2}-\d{2})?|analysis\/(?:default|history)|research\/store-read))?$/i.test(path);
  const judge = request.method === 'POST' && path === '/api/vps/judge/machines';
  if (!read && !judge) return reply('owner_view_scope_denied', 403);
  if (judge && request.headers.get('origin') !== new URL(request.url).origin) {
    return reply('origin_denied', 403);
  }
  return handleStoreRead(request, {
    db: options.db, bucket: options.bucket,
    // This principal is confined to the allowlist above. It has no relay
    // identity and is never persisted or handed to an analysis write endpoint.
    scopedRead: {principal: {authType: 'owner-view'}, canAccess: canReadPia},
  });
}
