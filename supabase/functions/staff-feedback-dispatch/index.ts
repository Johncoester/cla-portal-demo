/* Release flag is on. The function still does not send unless the server switch is the
 * string true. The sender key is never written to the response or to logs.
 * Do not read XAI_API_KEY here. */
import { DISPATCH_HTTP_ENABLED, handleStaffFeedbackDispatch, productionDeps } from './logic.mjs';

Deno.serve(async (req: Request) => {
  const result = await handleStaffFeedbackDispatch({ ...productionDeps(req), allowSend: DISPATCH_HTTP_ENABLED });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
