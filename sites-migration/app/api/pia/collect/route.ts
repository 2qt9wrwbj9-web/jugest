import { env } from 'cloudflare:workers';
import { handlePiaCollection } from '../../../../lib/collectors/pia-collection-api.mjs';

export function POST(request: Request) {
  const bindings = env as typeof env & {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    JUGEST_PIA_COLLECTOR?: string;
    JUGEST_PIA_WRITER_SHA256?: string;
  };
  return handlePiaCollection(request, {
    db: bindings.DB,
    bucket: bindings.BUCKET,
    enabled: bindings.JUGEST_PIA_COLLECTOR === 'enabled',
    writerHash: bindings.JUGEST_PIA_WRITER_SHA256,
  });
}
