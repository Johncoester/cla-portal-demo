/* gmail-send (Gmail phase 1, CLA Portal Live Test only). Logic: ../_shared/gmail-handlers.mjs (tested in test/test-gmail-phase1.js). */
import { handleSend } from '../_shared/gmail-handlers.mjs';
import { buildDeps } from '../_shared/gmail-deps.ts';

Deno.serve(async (req: Request) => {
  const deps = buildDeps(req);
  try { return await handleSend(req, deps); }
  catch (e) {
    const m = e && typeof e.message === 'string' ? e.message.replace(/\s+/g, ' ').trim() : '';
    const safe = m && m.length < 300 && !/ya29|refresh|secret|bearer|token/i.test(m) ? m : 'Something went wrong. Nothing was sent.';
    return new Response(JSON.stringify({ error: safe }), { status: 500, headers: { ...deps.headers, 'Content-Type': 'application/json' } });
  }
});
