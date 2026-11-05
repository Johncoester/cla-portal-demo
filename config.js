// DEMO-ONLY config for the PUBLIC TEST DEMO (https://johncoester.github.io/cla-portal-demo/). John, Nov 3: "Push it".
// The publish step never copies public/config.js; this file is copied by hand to the demo repo as config.js.
// Mock mode, FAKE DATA ONLY (everything stays in the visitor's browser). No URLs, no keys, no secrets.
// features.accounting: true turns the order Accounting tab ON for the demo only. The real live portal keeps it OFF
// (public/config.example.js has accounting: false, and the database switch private.features 'accounting' defaults to false). See docs/ACCOUNTING.md.
// devPicker: false (John, Nov 4, live28): NO fake-user picker on the public demo; the plain URL says "Please use the link you were sent."
// features.title: true (John, Nov 4, live36: "Push it live"): the order Title tab (title review, staff only) ON for the test demo. Go-live keeps it off
// (supabase mode defaults it off; the database switch private.features 'title' defaults to false). See docs/TITLE-MODULE-NOV4.md.
window.CLA_PORTAL_CONFIG = { mode: 'mock', features: { accounting: true, title: true }, devPicker: false };
