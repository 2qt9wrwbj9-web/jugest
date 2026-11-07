import {handleOwnerView, ownerViewAccess} from './owner-view.mjs';
import {sha256Text} from './storage/recovery.mjs';

const cacheHeaders = {
  'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'vary': 'Cookie',
};

function reply(request, code, status) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify({ok: false, code}), {
    status, headers: {...cacheHeaders, 'content-type': 'application/json; charset=utf-8'},
  });
}

function protect(request, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cacheHeaders)) headers.set(key, value);
  headers.delete('etag');
  headers.delete('last-modified');
  headers.delete('access-control-allow-origin');
  headers.delete('access-control-allow-credentials');
  return new Response(request.method === 'HEAD' ? null : response.body, {status: response.status, headers});
}

// This flag never opens a data route. Its separate read gate starts closed.
export function ownerTrialBlocksWrites(env) {
  return env.JUGEST_OWNER_VIEW === '1' || env.JUGEST_OWNER_TRIAL_STOP === '1';
}

export async function serveOwnerTrial(request, env, {development = false, renderApp}) {
  if (env.JUGEST_OWNER_TRIAL_STOP === '1') return reply(request, 'owner_trial_stopped', 503);

  const url = new URL(request.url);
  const path = url.pathname;
  const page = ['GET', 'HEAD'].includes(request.method) && path === '/';
  const status = request.method === 'GET' && path === '/api/owner-view';
  const appApi = path === '/api/vps/stores' || path.startsWith('/api/vps/stores/') ||
    path === '/api/vps/judge/machines';
  if (!page && !status && !appApi) return reply(request, 'owner_trial_route_closed', 404);

  // Only the hosted Sites ingress may assert these headers. A raw
  // Worker transport can inject them; verify replacement on the empty host.
  const email = !development && request.headers.get('oai-authenticated-user-email');
  const userId = email ? request.headers.get('oai-authenticated-user-id') : null;
  const readsEnabled = env.JUGEST_OWNER_TRIAL_READS === 'verified';
  const pinned = env.JUGEST_OWNER_TRIAL_OWNER_SHA256;
  const bootstrap = env.JUGEST_OWNER_TRIAL_BOOTSTRAP_EMAIL_SHA256;
  const legacyId = env.JUGEST_OWNER_USER_ID;
  if ((pinned && (legacyId || !/^[a-f0-9]{64}$/.test(pinned))) ||
      (bootstrap && (!/^[a-f0-9]{64}$/.test(bootstrap) || readsEnabled))) {
    return reply(request, 'owner_view_not_configured', 503);
  }
  const bootstrapOnly = bootstrap && !pinned && !legacyId;
  const fingerprint = (pinned || bootstrapOnly) && userId
    ? await sha256Text('jugest-sites-owner-v1:' + userId) : null;
  const ownerId = pinned || (bootstrapOnly ? bootstrap : legacyId);
  const asserted = pinned ? fingerprint : bootstrapOnly && userId
    ? await sha256Text(email.trim().toLowerCase()) : userId;
  const allowedStoreIds = new Set((env.JUGEST_OWNER_TRIAL_STORES ?? '').split(',').map(id => id.trim()).filter(Boolean));
  const options = {enabled: true, ownerId, userId: asserted, db: env.DB, bucket: env.BUCKET, allowedStoreIds};
  const denied = ownerViewAccess(options);
  if (denied) {
    if (page && request.method === 'GET' && denied.status === 401) {
      return new Response(null, {status: 303, headers: {...cacheHeaders, location: '/signin-with-chatgpt?return_to=%2F'}});
    }
    return protect(request, denied);
  }
  if (status) {
    const verification = bootstrapOnly ? {ownerFingerprint: fingerprint} : {};
    return protect(request, Response.json({ok: true, authenticated: true, readsEnabled, ...verification}));
  }
  if (appApi && !readsEnabled) return reply(request, 'owner_trial_data_locked', 403);

  try {
    const response = page ? await renderApp() : await handleOwnerView(request, options);
    return response.status >= 500
      ? reply(request, 'owner_trial_unavailable', 503)
      : protect(request, response);
  } catch {
    // Runtime/SQL details can contain tenant information. Never emit them.
    return reply(request, 'owner_trial_unavailable', 503);
  }
}
