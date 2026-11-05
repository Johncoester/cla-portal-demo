// Copy to config.js ONLY after a Supabase project is approved. Default (config.js as committed) = mock mode with fake data.
// LIVE: mode must stay "supabase". Do not set devPicker, do not point this file at a test lock, and do not reuse localStorage fake-user sessions.
// The browser ignores ?as= test links and clears cla-portal-new:locked when mode is supabase. Auth is Supabase Auth only.
// features.title: the order Title tab (docs/TITLE-MODULE-NOV4.md). Keep false on the live portal; the database switch (migration 61) is off too.
// features.accounting: the order Accounting tab (docs/ACCOUNTING.md). Keep false on the live portal; the database switch (migration 34) is off too.
// features.crm: the CRM (docs/CRM.md). Keep false at go-live; set true only when John approves (and also turn on the database switch, migration 22).
window.CLA_PORTAL_CONFIG = { mode: 'supabase', url: 'https://YOUR-PROJECT.supabase.co', anonKey: 'PUBLIC-ANON-KEY', features: { crm: false, accounting: false, title: false } };
