/* gmail-oauth-start (Gmail phase 1, CLA Portal Live Test only). Logic: ../_shared/gmail-handlers.mjs (tested in test/test-gmail-phase1.js). */
import { handleOauthStart } from '../_shared/gmail-handlers.mjs';
import { buildDeps } from '../_shared/gmail-deps.ts';

Deno.serve(async (req: Request) => {
  const deps = buildDeps(req);
  try { return await handleOauthStart(req, deps); }
  catch (_e) { return new Response(JSON.stringify({ error: 'Something went wrong. Nothing was sent.' }), { status: 500, headers: { ...deps.headers, 'Content-Type': 'application/json' } }); }
});
