import { writeFileSync } from 'node:fs';

const TAB_DELAY_MS = 200;
let marked = false;

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.replace(/\?v=[^./]+/, ''), context);
}

export async function load(url, context, nextLoad) {
  if (String(url).includes('/dealtasks.js') && !marked) {
    marked = true;
    writeFileSync('/tmp/tab-load-started-at', String(Date.now()));
    await new Promise((resolve) => setTimeout(resolve, TAB_DELAY_MS));
  }
  return nextLoad(url, context);
}
