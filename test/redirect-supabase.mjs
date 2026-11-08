const fake = new URL('./fake-supabase-client.mjs', import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('@supabase/supabase-js')) return { url: fake.href, shortCircuit: true };
  return nextResolve(specifier.replace(/\?v=[^./]+/, ''), context);
}
