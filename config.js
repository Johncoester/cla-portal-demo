// CLA Portal Live Test (https://johncoester.github.io/cla-portal-demo/). There is one portal. This file stays mock until John confirms a later login switch.
// Mock mode, FAKE DATA ONLY (everything stays in the visitor's browser). No URLs, no keys, no secrets.
// features.accounting, funding, wires, policy, and title are on for the mock data. In supabase mode those flags stay off until set.
// devPicker: false. The plain URL says "Please use the link you were sent." Do not set crm.
window.CLA_PORTAL_CONFIG = { mode: 'mock', features: { accounting: true, funding: true, wires: true, policy: true, title: true }, devPicker: false };
