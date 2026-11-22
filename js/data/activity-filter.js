// FF-071b (Janine's video, Nov 12 "CLA Portal Test - Processor and Seller Screens"; Francis Feedback ticket): on hosted files the
// Activity tab's filters did nothing and the Who column was empty. These helpers turn the filter bar into a database query and
// put a name and role on each entry. Pure, so the Node tests run them without Supabase.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// The filter bar's values, cleaned. Anything malformed is dropped (it never reaches the query).
export function activityFilters(f = {}) {
  const s = (v) => String(v == null ? '' : v).trim();
  const type = s(f.type); const actorId = s(f.actorId); const from = s(f.from); const to = s(f.to); const q = s(f.q).slice(0, 100);
  return { type: /^[a-z_]{1,40}$/i.test(type) ? type : '', actorId: UUID.test(actorId) ? actorId : '', from: DAY.test(from) ? from : '', to: DAY.test(to) ? to : '', q };
}
export const hasActivityFilter = (f) => !!(f.type || f.actorId || f.from || f.to || f.q);
// The start of a local calendar day as an ISO time (the From / To boxes are the viewer's own days, like the mock log).
export function localDayStart(day, addDays = 0) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + addDays).toISOString();
}
const likeSafe = (t) => t.replace(/[\\%_]/g, (c) => '\\' + c);
// q: a PostgREST builder on activity_log. Type is the first part of the action ("client" matches client.*).
export function applyActivityFilters(q, f) {
  if (f.type) q = q.or(`action.eq.${f.type},action.like.${f.type}.%`);
  if (f.actorId) q = q.eq('actor_id', f.actorId);
  if (f.from) q = q.gte('created_at', localDayStart(f.from));
  if (f.to) q = q.lt('created_at', localDayStart(f.to, 1));
  if (f.q) q = q.ilike('detail', `%${likeSafe(f.q)}%`);
  return q;
}
// The same rules on rows already read (a second guard, and what the tests check).
export function matchesActivity(a, f) {
  const t = String(a.action || '').split('.')[0];
  const at = Date.parse(a.createdAt || '');
  return (!f.type || t === f.type) && (!f.actorId || a.actorId === f.actorId)
    && (!f.from || at >= Date.parse(localDayStart(f.from))) && (!f.to || at < Date.parse(localDayStart(f.to, 1)))
    && (!f.q || String(a.detail || '').toLowerCase().includes(f.q.toLowerCase()));
}
const FILE_ROLE = { 'Client-Buyer': 'Buyer', 'Client-Seller': 'Seller', 'Buyer Agent': "Buyer's agent", 'Listing Agent': 'Listing agent' };
// people: Map(profileId -> { name, role }) from profiles; fileRoles: Map(profileId -> deal_participants role).
export function withActors(items, people, fileRoles = new Map()) {
  const who = (id) => {
    if (!id) return { name: 'Portal', role: 'Automatic' };
    const p = people.get(id); const fr = fileRoles.get(id);
    const role = fr ? (FILE_ROLE[fr] || fr) : (p && p.role && p.role !== 'Outside user' ? p.role : '');
    return { name: (p && p.name) || 'Someone on this file', role };
  };
  return items.map((a) => { const w = who(a.actorId); return { ...a, actorName: w.name, actorRole: w.role }; });
}
export function actorList(items) {
  const m = new Map();
  items.forEach((a) => { if (a.actorId && !m.has(a.actorId)) m.set(a.actorId, { id: a.actorId, name: a.actorName }); });
  return [...m.values()].sort((x, y) => x.name.localeCompare(y.name));
}
