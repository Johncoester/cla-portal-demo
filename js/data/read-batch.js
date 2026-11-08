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

export function routeTokens() {
  let current = 0;
  return {
    start() { return ++current; },
    isCurrent(token) { return token === current; },
  };
}

/* One profile read per navigation, shared by the calls that follow it.
 * A different person, a sign-out, or the next navigation drops it. */
export function profileFlight() {
  let flight = null;
  let userId = null;
  return {
    begin() { flight = null; },
    clear() { flight = null; userId = null; },
    load(user, fetcher) {
      if (!user || !user.id) { this.clear(); return Promise.resolve(null); }
      if (userId !== user.id) { flight = null; userId = user.id; }
      if (!flight) {
        const id = user.id;
        flight = Promise.resolve().then(() => fetcher(user)).catch((err) => {
          if (userId === id) flight = null;
          throw err;
        });
      }
      return flight;
    },
  };
}
