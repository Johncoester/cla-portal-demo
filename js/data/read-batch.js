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
  };
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
