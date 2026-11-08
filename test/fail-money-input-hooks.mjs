export async function resolve(specifier, context, nextResolve) {
  const clean = specifier.replace(/\?v=[^./]+/, '');
  if (clean.includes('money-input.js')) return { url: 'file:///money-input-503.mjs', shortCircuit: true };
  return nextResolve(clean, context);
}

export async function load(url, context, nextLoad) {
  if (url === 'file:///money-input-503.mjs' || String(url).includes('money-input.js')) {
    throw new Error('MONEY_INPUT_503');
  }
  return nextLoad(url, context);
}
