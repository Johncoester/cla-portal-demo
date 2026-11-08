import { register } from 'node:module';
register(new URL('./redirect-supabase.mjs', import.meta.url).href, import.meta.url);
