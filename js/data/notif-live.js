/* FF-115 (Francis Santos, confirmed Nov 24 2026 6:18 PM ET): keep the bell badge and the
 * notifications list current without a full page reload. Prefers a Supabase Realtime
 * subscription when the adapter can open one; otherwise a 30s poll that pauses while
 * the tab is hidden. start() does not fetch — the shell already loaded the first count. */
export const POLL_MS = 30000;
export const SUBSCRIBE_TIMEOUT_MS = 3000;

export function paintNotificationBadge(root, count) {
  if (!root || typeof root.querySelector !== 'function') return;
  const n = Math.max(0, Number(count) || 0);
  const badge = root.querySelector('.notification-num');
  const bell = root.querySelector('[data-bell]');
  if (badge) badge.textContent = String(n);
  if (bell) {
    const label = n + ' unread notification(s)';
    bell.setAttribute('title', label);
    if (bell.hasAttribute('aria-label') || bell.getAttribute('aria-label') != null) {
      bell.setAttribute('aria-label', 'Notifications, ' + label);
    }
  }
}

export function subscribeNotificationsChannel({
  sb,
  userId,
  onEvent,
  timeoutMs = SUBSCRIBE_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (!sb || !userId || typeof sb.channel !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (unsub) => {
      if (settled) return;
      settled = true;
      if (timer) { try { clearTimeoutFn(timer); } catch (e) { /* ignore */ } }
      resolve(unsub);
    };
    let ch;
    // E2E-GREEN-1: remove the channel at most once. In realtime-js, removeChannel() closes the
    // channel, which calls this subscribe callback again with CLOSED. Removing it again from
    // there looped until the browser threw "Maximum call stack size exceeded".
    let removed = false;
    const removeOnce = () => {
      if (removed || !ch) return;
      removed = true;
      try { sb.removeChannel(ch); } catch (e) { /* ignore */ }
    };
    try {
      ch = sb.channel('notif-live-' + userId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: 'profile_id=eq.' + userId,
        }, () => { if (typeof onEvent === 'function') onEvent(); })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            finish(removeOnce);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            if (!settled) removeOnce();
            finish(null);
          }
        });
    } catch (e) {
      finish(null);
      return;
    }
    timer = setTimeoutFn(() => {
      if (!settled) removeOnce();
      finish(null);
    }, timeoutMs);
  });
}

export function createNotificationLive({
  subscribe,
  getCount,
  listNotifications,
  apply,
  listOpen,
  pollMs = POLL_MS,
  isHidden = () => (typeof document !== 'undefined' && document.hidden),
  addVisibilityListener = (fn) => document.addEventListener('visibilitychange', fn),
  removeVisibilityListener = (fn) => document.removeEventListener('visibilitychange', fn),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let stopped = true;
  let pollId = null;
  let unsub = null;
  let vis = null;
  let inFlight = false;
  let pending = false;
  let mode = 'idle';

  async function refresh() {
    if (stopped) return;
    if (typeof getCount !== 'function' || typeof apply !== 'function') return;
    if (inFlight) { pending = true; return; }
    inFlight = true;
    try {
      const count = await getCount();
      let list = null;
      if (listOpen && listOpen() && typeof listNotifications === 'function') list = await listNotifications();
      if (!stopped) apply({ count, list });
    } catch (e) {
      /* a failed refresh leaves the last badge and list in place */
    } finally {
      inFlight = false;
      if (pending && !stopped) { pending = false; refresh(); }
    }
  }

  function startPoll() {
    mode = 'poll';
    if (pollId) return;
    pollId = setIntervalFn(() => { if (!isHidden()) refresh(); }, pollMs);
  }

  function stopPoll() {
    if (pollId) { try { clearIntervalFn(pollId); } catch (e) { /* ignore */ } }
    pollId = null;
  }

  function onVisible() {
    if (stopped || isHidden()) return;
    if (mode === 'poll') refresh();
  }

  async function start() {
    if (!stopped) return;
    stopped = false;
    vis = () => onVisible();
    if (typeof addVisibilityListener === 'function') addVisibilityListener(vis);
    if (typeof subscribe === 'function') {
      try {
        const result = await subscribe(() => { if (!stopped) refresh(); });
        if (stopped) {
          if (typeof result === 'function') { try { result(); } catch (e) { /* ignore */ } }
          return;
        }
        if (typeof result === 'function') {
          unsub = result;
          mode = 'realtime';
          return;
        }
      } catch (e) {
        unsub = null;
      }
    }
    if (!stopped) startPoll();
  }

  function stop() {
    stopped = true;
    pending = false;
    stopPoll();
    if (typeof unsub === 'function') { try { unsub(); } catch (e) { /* ignore */ } }
    unsub = null;
    if (vis && typeof removeVisibilityListener === 'function') {
      try { removeVisibilityListener(vis); } catch (e) { /* ignore */ }
    }
    vis = null;
    mode = 'idle';
  }

  return { start, stop, refresh, getMode: () => mode, isStopped: () => stopped };
}
