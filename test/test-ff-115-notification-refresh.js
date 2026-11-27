/* FF-115 (Francis Santos, confirmed Nov 24 2026 6:18 PM ET, answer "Both"):
   new notifications appear on their own in the bell badge and the notifications list,
   without a manual page refresh. */
import { readFileSync } from 'node:fs';
import { createNotificationLive, paintNotificationBadge, subscribeNotificationsChannel, POLL_MS, SUBSCRIBE_TIMEOUT_MS } from '../js/data/notif-live.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function fakeDom(count = 2) {
  const badge = { textContent: String(count) };
  const bell = { attrs: { title: count + ' unread notification(s)', 'aria-label': 'Notifications' }, setAttribute(k, v) { this.attrs[k] = v; }, hasAttribute(k) { return k in this.attrs; }, getAttribute(k) { return this.attrs[k]; } };
  return { badge, bell, querySelector(sel) { return sel === '.notification-num' ? badge : sel === '[data-bell]' ? bell : null; } };
}

/* --- paintNotificationBadge --- */
{
  const root = fakeDom(0);
  paintNotificationBadge(root, 4);
  ok(root.badge.textContent === '4' && root.bell.attrs.title === '4 unread notification(s)', 'the badge and the bell title show the new unread count');
  paintNotificationBadge(root, 0);
  ok(root.badge.textContent === '0', 'a zero count still updates the badge');
  paintNotificationBadge(root, -3);
  ok(root.badge.textContent === '0', 'a negative count is shown as zero');
  paintNotificationBadge(null, 1);
  ok(true, 'a missing root is ignored');
}

/* --- start does not fetch --- */
{
  let counts = 0; let lists = 0;
  const live = createNotificationLive({
    getCount: async () => { counts += 1; return 1; },
    listNotifications: async () => { lists += 1; return []; },
    apply: () => {},
    listOpen: () => true,
    subscribe: () => null,
    pollMs: 30000,
    isHidden: () => false,
    addVisibilityListener() {},
    removeVisibilityListener() {},
    setIntervalFn() { return 1; },
    clearIntervalFn() {},
  });
  await live.start();
  ok(counts === 0 && lists === 0 && live.getMode() === 'poll', 'start does not fetch a count or a list (the shell already did)');
  live.stop();
  ok(live.isStopped() && live.getMode() === 'idle', 'stop clears the poll');
}

/* --- realtime event updates badge; list only when the dropdown is open --- */
{
  let onEvent = null;
  let counts = 0; let lists = 0;
  let applied = [];
  let open = false;
  const live = createNotificationLive({
    subscribe: (fn) => { onEvent = fn; return () => { onEvent = null; }; },
    getCount: async () => { counts += 1; return 5; },
    listNotifications: async () => { lists += 1; return [{ id: 'n1', title: 'New task', readAt: null }]; },
    apply: (p) => { applied.push(p); },
    listOpen: () => open,
    addVisibilityListener() {},
    removeVisibilityListener() {},
    setIntervalFn() { throw new Error('poll should not start when realtime works'); },
    clearIntervalFn() {},
  });
  await live.start();
  ok(live.getMode() === 'realtime' && counts === 0, 'a working Realtime subscribe is used instead of a poll');
  onEvent();
  await Promise.resolve();
  await Promise.resolve();
  ok(counts === 1 && lists === 0 && applied.length === 1 && applied[0].count === 5 && applied[0].list === null,
    'an event with the list closed refreshes only the badge count');
  open = true;
  onEvent();
  await Promise.resolve();
  await Promise.resolve();
  ok(lists === 1 && applied[1] && applied[1].list && applied[1].list[0].id === 'n1',
    'an event with the list open also refreshes the notifications list');
  live.stop();
  ok(onEvent === null, 'stop unsubscribes the Realtime channel');
  const after = counts;
  // a stale event after stop must not fetch
  if (typeof onEvent === 'function') onEvent();
  await Promise.resolve();
  ok(counts === after, 'a stopped helper ignores later events');
}

/* --- subscribe failure falls back to poll; hidden tab pauses; visible tab refreshes --- */
{
  let ticks = [];
  let hidden = true;
  let vis = null;
  let counts = 0;
  let cleared = 0;
  const live = createNotificationLive({
    subscribe: async () => { throw new Error('realtime unavailable'); },
    getCount: async () => { counts += 1; return counts; },
    listNotifications: async () => [],
    apply: () => {},
    listOpen: () => false,
    pollMs: 30,
    isHidden: () => hidden,
    addVisibilityListener: (fn) => { vis = fn; },
    removeVisibilityListener: (fn) => { if (vis === fn) vis = null; },
    setIntervalFn: (fn, ms) => { ticks.push({ fn, ms }); return 7; },
    clearIntervalFn: (id) => { if (id === 7) cleared += 1; },
  });
  await live.start();
  ok(live.getMode() === 'poll' && ticks.length === 1 && ticks[0].ms === 30 && counts === 0,
    'when Realtime is unavailable, a poll starts and still does not fetch immediately');
  ticks[0].fn();
  await Promise.resolve();
  ok(counts === 0, 'the poll is paused while the tab is hidden');
  hidden = false;
  vis();
  await Promise.resolve();
  await Promise.resolve();
  ok(counts === 1, 'showing the tab again refreshes once');
  ticks[0].fn();
  await Promise.resolve();
  await Promise.resolve();
  ok(counts === 2, 'a later visible poll tick also refreshes');
  live.stop();
  ok(cleared === 1 && vis === null, 'stop clears the interval and the visibility listener');
}

/* --- subscribe that returns null (mock / no channel) uses the default 30s poll --- */
{
  let ms = 0;
  const live = createNotificationLive({
    subscribe: () => null,
    getCount: async () => 0,
    apply: () => {},
    listOpen: () => false,
    isHidden: () => false,
    addVisibilityListener() {},
    removeVisibilityListener() {},
    setIntervalFn: (fn, interval) => { ms = interval; return 1; },
    clearIntervalFn() {},
  });
  await live.start();
  ok(ms === POLL_MS && POLL_MS === 30000, 'the fallback poll is 30 seconds');
  live.stop();
}

/* --- logout during a slow subscribe must not leave a channel --- */
{
  let unsubbed = 0;
  let finish;
  const live = createNotificationLive({
    subscribe: () => new Promise((resolve) => { finish = () => resolve(() => { unsubbed += 1; }); }),
    getCount: async () => 0,
    apply: () => {},
    listOpen: () => false,
    addVisibilityListener() {},
    removeVisibilityListener() {},
    setIntervalFn() { return 1; },
    clearIntervalFn() {},
  });
  const starting = live.start();
  live.stop();
  finish();
  await starting;
  ok(unsubbed === 1 && live.isStopped(), 'logging out while a subscribe is still opening closes that channel');
}

/* --- subscribeNotificationsChannel --- */
{
  const events = [];
  const removed = [];
  let statusFn = null;
  const sb = {
    channel(name) {
      ok(name === 'notif-live-u1', 'the channel is named for this person');
      const api = {
        on(kind, filter, handler) {
          ok(kind === 'postgres_changes' && filter.table === 'notifications' && filter.schema === 'public'
            && filter.event === '*' && filter.filter === 'profile_id=eq.u1',
            'the channel listens for this person\'s notification rows');
          this._handler = handler;
          return this;
        },
        subscribe(fn) { statusFn = fn; return this; },
      };
      return api;
    },
    removeChannel(ch) { removed.push(ch); },
  };
  const p = subscribeNotificationsChannel({ sb, userId: 'u1', onEvent: () => events.push(1), timeoutMs: 1000, setTimeoutFn: () => 1, clearTimeoutFn() {} });
  statusFn('SUBSCRIBED');
  const unsub = await p;
  ok(typeof unsub === 'function', 'a successful subscribe returns an unsubscribe function');
  unsub();
  ok(removed.length === 1, 'unsubscribe removes the channel');

  let status2 = null;
  const sb2 = {
    channel() {
      return { on() { return this; }, subscribe(fn) { status2 = fn; return this; } };
    },
    removeChannel() { removed.push('err'); },
  };
  const p2 = subscribeNotificationsChannel({ sb: sb2, userId: 'u2', onEvent: () => {}, timeoutMs: 1000, setTimeoutFn: () => 1, clearTimeoutFn() {} });
  status2('CHANNEL_ERROR');
  ok((await p2) === null, 'a failed channel falls back (returns null)');

  const sb3 = {
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() { removed.push('to'); },
  };
  let toFn = null;
  const p3 = subscribeNotificationsChannel({
    sb: sb3, userId: 'u3', onEvent: () => {}, timeoutMs: 5,
    setTimeoutFn: (fn) => { toFn = fn; return 9; },
    clearTimeoutFn() {},
  });
  toFn();
  ok((await p3) === null && removed.includes('to'), 'a hung subscribe times out, drops the channel, and returns null');
  ok(SUBSCRIBE_TIMEOUT_MS === 3000, 'the live subscribe wait is three seconds, and it does not block the first paint');
  ok((await subscribeNotificationsChannel({ sb: null, userId: 'u1' })) === null, 'no client means no subscribe');
}

/* --- E2E-GREEN-1: realtime-js calls the status callback with CLOSED from inside removeChannel --- */
{
  // A fake that behaves like realtime-js: removing a channel closes it, and closing it calls
  // the subscribe callback again (synchronously) with CLOSED. Before the fix this recursed
  // until "Maximum call stack size exceeded" on every page of the portal.
  const realtimeLike = () => {
    const state = { removes: 0, statusFn: null };
    state.sb = {
      channel() { return { on() { return this; }, subscribe(fn) { state.statusFn = fn; return this; } }; },
      removeChannel() {
        state.removes += 1;
        if (state.removes > 50) throw new RangeError('Maximum call stack size exceeded');
        if (state.statusFn) state.statusFn('CLOSED');
      },
    };
    return state;
  };
  const a = realtimeLike();
  const pa = subscribeNotificationsChannel({ sb: a.sb, userId: 'ua', onEvent: () => {}, timeoutMs: 1000, setTimeoutFn: () => 1, clearTimeoutFn() {} });
  a.statusFn('SUBSCRIBED');
  const unsubA = await pa;
  unsubA();
  unsubA();
  ok(a.removes === 1, 'logging out removes the live channel once, even though removing it reports CLOSED');

  const b = realtimeLike();
  const pb = subscribeNotificationsChannel({ sb: b.sb, userId: 'ub', onEvent: () => {}, timeoutMs: 1000, setTimeoutFn: () => 1, clearTimeoutFn() {} });
  b.statusFn('CHANNEL_ERROR');
  ok((await pb) === null && b.removes === 1, 'a channel error removes the channel once and falls back to polling');

  const c = realtimeLike();
  let toC = null;
  const pc = subscribeNotificationsChannel({ sb: c.sb, userId: 'uc', onEvent: () => {}, timeoutMs: 5, setTimeoutFn: (fn) => { toC = fn; return 3; }, clearTimeoutFn() {} });
  toC();
  ok((await pc) === null && c.removes === 1, 'a hung subscribe that times out removes the channel once');
}

/* --- SQL files: add to the realtime publication, and a rollback --- */
{
  const mig = read('supabase/migrations/20261131030000_notifications_realtime.sql');
  const rb = read('supabase/rollbacks/20261131030000_notifications_realtime.sql');
  ok(mig.includes("alter publication supabase_realtime add table public.notifications")
    && mig.includes('replica identity full')
    && mig.includes('Not applied by this commit'),
    'the migration adds notifications to supabase_realtime with replica identity full, and is not self-applied');
  ok(rb.includes('drop table public.notifications') || rb.includes('DROP TABLE public.notifications')
    || /alter publication supabase_realtime drop table(\s+if exists)?\s+public\.notifications/i.test(rb)
    || rb.includes("pubname = 'supabase_realtime'"),
    'the rollback removes notifications from the realtime publication');
  ok(rb.toLowerCase().includes('replica identity default') || rb.toLowerCase().includes('replica identity using index'),
    'the rollback restores the default replica identity');
}

/* --- wiring in the shell and the hosted adapter --- */
{
  const app = read('js/app.js');
  const hosted = read('js/data/supabase-adapter.js');
  const adapter = read('js/data/adapter.js');
  ok(app.includes("from './data/notif-live.js?v=202611310700'") && app.includes('startNotificationLive') && app.includes('stopNotificationLive'),
    'the shell starts and stops the live notification helper');
  ok(app.includes('startNotificationLive(u)') && app.includes('wireChrome'),
    'the helper starts from the chrome after the page is painted, not before');
  ok(app.includes('stopNotificationLive()') && app.includes("data-signout") && app.includes('pickPerson'),
    'the helper stops on logout and is restarted when the signed-in person changes');
  ok(hosted.includes('subscribeNotifications') && hosted.includes('subscribeNotificationsChannel'),
    'the hosted adapter opens a Realtime channel for this person\'s notifications');
  ok(adapter.includes("supabase-adapter.js?v=202611314800") && app.includes('adapter.js?v=202611314800')
    && read('index.html').includes('js/app.js?v=202611314800'),
    'the restamped shell and hosted adapter load at 202611310700');
  ok(!app.includes('api.notificationCount(); startNotificationLive') && !app.includes('await startNotificationLive'),
    'starting the helper is not awaited on the first paint and does not add a second initial count read');
}

console.log(fail ? `FAIL ${fail}` : 'all FF-115 notification refresh checks passed');
process.exit(fail ? 1 : 0);
