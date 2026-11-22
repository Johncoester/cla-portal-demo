/* A GitHub Pages 503 on one file rejects the dynamic import that asked for it.
   That file is often nested (scheduling-panel.js, document-list.js, processor-assign.js, crm-templates.js).
   Chrome refetches the same URL on the next import(), including that nested file, so this calls the same import again.
   A new query string would be a second copy of the module, and it would not refetch a nested file. */
const WAITS = [200, 600];

export async function importWithRetry(load, opts = {}) {
  const tries = opts.tries == null ? 3 : opts.tries;
  const waits = opts.waits || WAITS;
  const sleep = opts.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let error;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      return await load();
    } catch (err) {
      error = err;
      if (attempt + 1 >= tries) break;
      await sleep(waits[Math.min(attempt, waits.length - 1)]);
    }
  }
  throw error;
}
