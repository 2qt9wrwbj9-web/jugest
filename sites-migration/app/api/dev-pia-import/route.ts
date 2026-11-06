import {env} from 'cloudflare:workers';

async function route(request: Request) {
  const bindings = env as typeof env & {
    DB?: D1Database; BUCKET?: R2Bucket; JUGEST_DEV_SESSION?: string;
    JUGEST_DEV_PIA_IMPORT_SOURCES?: string; JUGEST_OWNER_VIEW?: string;
  };
  if (import.meta.env.DEV && bindings.JUGEST_DEV_SESSION === '1' && bindings.JUGEST_OWNER_VIEW !== '1') {
    let sources;
    try { sources = JSON.parse(bindings.JUGEST_DEV_PIA_IMPORT_SOURCES ?? '{}'); }
    catch { return Response.json({ok: false, code: 'import_configuration_invalid'}, {status: 503}); }
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
      return Response.json({ok: false, code: 'import_configuration_invalid'}, {status: 503});
    }
    const {handleDevelopmentPiaImport} = await import('../../../dev/pia-import.mjs');
    return handleDevelopmentPiaImport(request, {enabled: true, db: bindings.DB, bucket: bindings.BUCKET, sources});
  }
  return new Response('Not Found', {status: 404, headers: {'cache-control': 'no-store'}});
}
export const GET = route;
export const POST = route;
