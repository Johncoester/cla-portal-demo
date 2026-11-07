/* Release flag is on. The function still does not send unless the server switch is the
 * string true. JWT verification stays on. Do not deploy this with --no-verify-jwt.
 * The sender key is never written to the response or to logs.
 * Do not read XAI_API_KEY here. */
import { DISPATCH_HTTP_ENABLED, handleStaffFeedbackDispatch, productionDeps, toDispatchResponse } from './logic.mjs';

export async function handleDispatchRequest(req: Request): Promise<Response> {
  const result = await handleStaffFeedbackDispatch({ ...productionDeps(req), allowSend: DISPATCH_HTTP_ENABLED });
  return toDispatchResponse(result);
}

Deno.serve(handleDispatchRequest);
