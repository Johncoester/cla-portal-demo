/* gmail-oauth-callback (Gmail phase 1, CLA Portal Live Test only). Google sends the browser here after consent (verify_jwt off:
 * the one-time state, bound to the portal login that pressed Connect Gmail, is the check). Logic: ../_shared/gmail-handlers.mjs. */
import { handleOauthCallback } from '../_shared/gmail-handlers.mjs';
import { buildDeps } from '../_shared/gmail-deps.ts';
import { PORTAL_ORIGIN } from '../_shared/gmail-core.mjs';

Deno.serve(async (req: Request) => {
  try { return await handleOauthCallback(req, buildDeps(req)); }
  catch (_e) { return new Response(null, { status: 302, headers: { Location: `${PORTAL_ORIGIN}/#/profile?gmail=failed`, 'Cache-Control': 'no-store' } }); }
});
