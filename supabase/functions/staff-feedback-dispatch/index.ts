/* NOT DEPLOYED. Do not deploy, and do not invoke, until John confirms delivery scope.
 * This handler does not read secrets and does not call the webhook.
 * When a later review turns dispatch on, the worker reads only:
 *   STAFF_FEEDBACK_BRIDGE_URL
 *   STAFF_FEEDBACK_BRIDGE_TOKEN
 *   STAFF_FEEDBACK_DISPATCH_ENABLED
 * Those values stay in the function environment. They are not put in the repo, the browser, or logs.
 * Do not read or change XAI_API_KEY here. Voice is a different feature. */
import { handleStaffFeedbackDispatch } from './logic.mjs';

Deno.serve((_req: Request) => {
  const result = handleStaffFeedbackDispatch();
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
