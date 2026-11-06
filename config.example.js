// Shape for the later login switch on CLA Portal Live Test. Not a second portal. The published config.js stays mode: 'mock' until John confirms.
// When that switch is confirmed: mode is supabase, no devPicker, no ?as= links, and mock fixture storage is cleared. Auth is Supabase Auth only.
// features.title, features.accounting, and features.crm stay false until John turns each one on. The database switches default off too.
window.CLA_PORTAL_CONFIG = { mode: 'supabase', url: 'https://YOUR-PROJECT.supabase.co', anonKey: 'PUBLIC-ANON-KEY', features: { crm: false, accounting: false, title: false } };
