/* gmail-sync (Gmail phase 1, CLA Portal Live Test only). Logic: ../_shared/gmail-handlers.mjs (tested in test/test-gmail-phase1.js). */
import { handleSync } from '../_shared/gmail-handlers.mjs';
import { buildDeps } from '../_shared/gmail-deps.ts';

Deno.serve(async (req: Request) => {
  const deps = buildDeps(req);
  try { return await handleSync(req, deps); }
  catch (_e) { return new Response(JSON.stringify({ error: 'Something went wrong.' }), { status: 500, headers: { ...deps.headers, 'Content-Type': 'application/json' } }); }
});
