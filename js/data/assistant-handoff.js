/* Async handoff to the tech assistant. This is not a chat model and it does not call one.
 * Official routine docs: HTTP 200 means a webhook run was accepted, not that it replied.
 * https://cursor.com/help/grok-bot/routines.md
 * Both switches stay off until a parent installs an approved routine URL and Bearer
 * as backend secrets and a separate write-back is authorized. No key belongs in this file. */
export const HANDOFF_ENABLED = false;
export const RETURN_PATH_ENABLED = false;

export const PENDING_CONNECTION = 'Saved in this portal. Not delivered to the tech assistant. No reply has been received.';

export function connectionRequirements() {
  return Object.freeze([
    'John authorizes a webhook routine on this tech assistant for TEST portal feedback only. The routine must not deploy, delete, or send mail.',
    'The owner copies the generated HTTPS URL and sender key from the routine panel into backend function secrets. The key is not put in the repo, the browser, or chat.',
    'Dispatch stays off, and new outbox rows keep dispatch_allowed false, until that installation is reviewed.',
    'The POST body stays the existing five correlation fields. HTTP 200 is recorded as run accepted. It is not a reply and it is not completion.',
    'A screenshot stays in the existing private image store. The webhook body does not include file bytes, and this pilot does not read attachments.',
    'A sentence in this portal requires a separate authorized write of an unpublished draft. John publishes it. Private chat, Gmail, and other credentials are not a reply channel.',
  ]);
}

/* saved -> accepted -> replied. A 200 moves saved/pending to accepted only when dispatch is allowed. */
export function classifyAcceptance({ httpStatus = null, dispatchAllowed = false, enabled = HANDOFF_ENABLED, prior = 'pending_dispatch' } = {}) {
  if (prior === 'replied') return { phase: 'replied', duplicate: true, replied: true, runAccepted: true, transportCalled: false };
  if (prior === 'run_accepted' || prior === 'bot_acknowledged') return { phase: 'accepted', duplicate: true, replied: false, runAccepted: true, transportCalled: false };
  if (!enabled || dispatchAllowed !== true || httpStatus !== 200) {
    return { phase: 'saved', duplicate: false, replied: false, runAccepted: false, transportCalled: false, reason: 'bridge_unconfigured' };
  }
  return { phase: 'accepted', duplicate: false, replied: false, runAccepted: true, transportCalled: true, reason: 'run_started' };
}

/* The return path is a different grant from the webhook. It is not Gmail and it is not private chat. */
export function classifyReturn({ enabled = RETURN_PATH_ENABLED, correlationId = '', eventId = '' } = {}) {
  if (!enabled) return { phase: 'saved', replied: false, published: false, reason: 'return_path_unconfigured' };
  if (!correlationId || correlationId !== eventId) return { phase: 'saved', replied: false, published: false, reason: 'correlation_mismatch' };
  return { phase: 'replied', replied: true, published: false, reason: 'draft_pending_john' };
}

/* File text and chat text are evidence. They do not change status, delivery, or permission. */
export function noteEffect() {
  return { status: 'open', sent: false, replied: false, dispatchAllowed: false, published: false };
}

export async function attemptHandoff(row, transport) {
  const decision = classifyAcceptance({
    httpStatus: null,
    dispatchAllowed: row && row.dispatchAllowed === true,
    enabled: HANDOFF_ENABLED,
    prior: row && row.deliveryState,
  });
  if (!decision.transportCalled) return { ...decision, httpStatus: null };
  let status = 0;
  try {
    const res = await transport();
    status = res && Number(res.status);
  } catch (e) {
    return { phase: 'saved', duplicate: false, replied: false, runAccepted: false, transportCalled: true, httpStatus: null, reason: 'transport_timeout' };
  }
  return { ...classifyAcceptance({ httpStatus: status, dispatchAllowed: true, enabled: true, prior: row.deliveryState }), httpStatus: status };
}
