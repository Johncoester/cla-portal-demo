/* Overlap independent reads that already belong to the signed-in caller.
 * This does not cache across people and does not widen a query. */

export function gatherReads(named) {
  const keys = Object.keys(named);
  return Promise.all(keys.map((key) => named[key]())).then((values) => {
    const out = {};
    keys.forEach((key, i) => { out[key] = values[i]; });
    return out;
  });
}

/* At most `limit` calls at once. Used for per-file reads so a long order list cannot open one request per file all at once. */
export async function mapLimit(items, limit, fn) {
  const list = items || [];
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, list.length));
  if (!list.length) return out;
  await Promise.all(Array.from({ length: workers }, async () => {
    while (cursor < list.length) {
      const i = cursor++;
      out[i] = await fn(list[i], i);
    }
  }));
  return out;
}

export function routeTokens() {
  let current = 0;
  return {
    start() { return ++current; },
    isCurrent(token) { return token === current; },
  };
}

/* One profile read per navigation, shared by the calls that follow it.
 * A different person, a sign-out, or the next navigation drops it. */
/* One snapshot of the heavy file reads for the person this navigation already signed in.
 * The next navigation, a sign-out, or another person drops it. A failed read is not kept. */
export function navigationReads() {
  let generation = 0;
  let owner = '';
  let box = new Map();
  return {
    begin(id) {
      generation += 1;
      owner = id || '';
      box = new Map();
    },
    clear() { this.begin(''); },
    userId() { return owner; },
    share(id, key, fn) {
      if (!id || id !== owner) return Promise.resolve().then(fn);
      if (!box.has(key)) this.seed(id, key, Promise.resolve().then(fn));
      return box.get(key);
    },
    seed(id, key, promise) {
      if (!id || id !== owner || box.has(key)) return;
      const ticket = generation;
      const p = Promise.resolve(promise);
      p.catch(() => { if (ticket === generation && box.get(key) === p) box.delete(key); });
      box.set(key, p);
    },
    generation() { return generation; },
  };
}

/* Reads started before the signed-in person is confirmed.
 * A rejection is marked seen immediately and still rejects for the caller.
 * A read is reused only when it started for the same person who is confirmed,
 * and only in the auth generation that confirmed them. An unknown owner is
 * dropped and the caller reads again. */
export function speculativeReads() {
  let primed = new Map();
  const tracked = (fn) => {
    const p = Promise.resolve().then(fn);
    p.catch(() => {});
    return p;
  };
  return {
    clear() { primed = new Map(); },
    read(owner, key, fn, nav) {
      const known = owner || '';
      if (known && nav && nav.userId() === known) return nav.share(known, key, fn);
      const existing = primed.get(key);
      if (existing && existing.owner === known) return existing.promise;
      const entry = { owner: known, promise: tracked(fn) };
      primed.set(key, entry);
      return entry.promise;
    },
    adopt(nav, id, ticket, generation) {
      if (!id || ticket !== generation) { primed = new Map(); return false; }
      const kept = [...primed].filter(([, entry]) => entry.owner === id);
      primed = new Map();
      nav.begin(id);
      for (const [key, entry] of kept) nav.seed(id, key, entry.promise);
      return true;
    },
  };
}

/* The person remembered for this navigation. An auth change drops them. */
export function identitySlot() {
  let gen = 0;
  let user = null;
  let at = -1;
  return {
    generation() { return gen; },
    invalidate() { gen += 1; user = null; at = -1; },
    forget() { user = null; at = -1; },
    current() { return at === gen ? user : null; },
    hold(person, ticket) {
      if (ticket !== gen || !person || !person.id) { user = null; at = -1; return null; }
      user = person;
      at = ticket;
      return person;
    },
  };
}

/* The first observed id while nobody is confirmed is the session restore: keep the route.
 * A different id on any later event, a sign-out, a repeat SIGNED_IN of a confirmed person,
 * or USER_UPDATED drops the profile, the demo check, and reads that are not that person's. */
export function authEventAction(event, nextId, heldId, ownerId, pendingId = '') {
  if (event === 'SIGNED_OUT') return 'drop';
  if (pendingId && nextId && pendingId !== nextId) return 'drop';
  if (heldId && nextId && heldId !== nextId) return 'drop';
  if (ownerId && nextId && ownerId !== nextId) return 'drop';
  if (event === 'USER_UPDATED') return 'drop';
  if (event === 'SIGNED_IN' && ((heldId && heldId === nextId) || (ownerId && ownerId === nextId))) return 'drop';
  return 'keep';
}

export function profileFlight() {
  let flight = null;
  let userId = null;
  let seq = 0;
  return {
    begin() { seq += 1; flight = null; },
    clear() { seq += 1; flight = null; userId = null; },
    load(user, fetcher) {
      if (!user || !user.id) { this.clear(); return Promise.resolve(null); }
      if (userId !== user.id) { flight = null; userId = user.id; }
      if (!flight) {
        const id = user.id;
        const ticket = seq;
        flight = Promise.resolve().then(() => fetcher(user)).then((profile) => {
          if (ticket !== seq || userId !== id) return null;
          return profile;
        }).catch((err) => {
          if (ticket === seq && userId === id) flight = null;
          throw err;
        });
      }
      return flight;
    },
  };
}
