/* Backend worker shell. Not deployed. The browser does not call this.
 * Secrets, later, in the function environment only (never the repo, browser, or logs):
 *   STAFF_FEEDBACK_BRIDGE_URL
 *   STAFF_FEEDBACK_BRIDGE_TOKEN
 *   STAFF_FEEDBACK_DISPATCH_ENABLED = true   only after John confirms delivery
 * This file does not read XAI_API_KEY. Voice is a different feature.
 * HTTP 200 from the routine means a run started, not that the bot read or replied.
 * https://cursor.com/help/grok-bot/routines.md */
export const DISPATCH_HTTP_ENABLED = false;

export function readBridgeConfig(env) {
  const get = (name) => (env && typeof env.get === 'function' ? env.get(name) : env ? env[name] : '') || '';
  return {
    enabled: get('STAFF_FEEDBACK_DISPATCH_ENABLED') === 'true',
    url: get('STAFF_FEEDBACK_BRIDGE_URL'),
    token: get('STAFF_FEEDBACK_BRIDGE_TOKEN'),
  };
}

export function handleStaffFeedbackDispatch() {
  if (!DISPATCH_HTTP_ENABLED) {
    return {
      status: 503,
      body: {
        sent: false,
        deliveryState: 'pending_dispatch',
        reason: 'bridge_unconfigured',
        error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.',
      },
    };
  }
  return {
    status: 503,
    body: {
      sent: false,
      deliveryState: 'pending_dispatch',
      reason: 'bridge_unconfigured',
      error: 'Dispatch is not enabled. The webhook was not called. Reports stay pending.',
    },
  };
}
