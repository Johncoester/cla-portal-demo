export async function resolve(specifier, context, nextResolve) {
  const clean = specifier.replace(/\?v=[^./]+/, '');
  return nextResolve(clean, context);
}
