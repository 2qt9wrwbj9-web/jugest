import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {handleOwnerView} from '../../../lib/owner-view.mjs';

export async function GET(request: Request) {
  const bindings = env as typeof env & {JUGEST_OWNER_VIEW?: string; JUGEST_OWNER_USER_ID?: string};
  const enabled = bindings.JUGEST_OWNER_VIEW === '1';
  const user = enabled && !import.meta.env.DEV ? await getChatGPTUser() : null;
  return handleOwnerView(request, {enabled, ownerId: bindings.JUGEST_OWNER_USER_ID, userId: user?.userId});
}
