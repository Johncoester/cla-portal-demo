/* An entity buyer or seller is shown by the entity name. A person is still first and last.
 * fileTitleOf matches constants.fileTitleOf for people (last name, else first) and uses the entity name
 * when that buyer or seller is an entity. */
export function partyDisplayName(p) {
  if (!p) return '';
  const role = p.role || '';
  const client = role === 'Client-Buyer' || role === 'Client-Seller';
  const ent = p.entity && String(p.entity.name || '').trim();
  if (client && ent) return ent;
  const c = p.contact || {};
  const person = `${c.firstName || ''} ${c.lastName || ''}`.trim();
  const company = String(c.company || '').trim();
  if (client && !person && company) return company;
  return person || company || (ent || '') || 'Unnamed contact';
}

export function fileTitleOf(participants) {
  const side = (role) => {
    const seen = new Set();
    const names = [];
    for (const p of participants || []) {
      if (!p || p.role !== role) continue;
      if (!p.contact && !(p.entity && String(p.entity.name || '').trim())) continue;
      const ent = p.entity && String(p.entity.name || '').trim();
      const last = String((p.contact && p.contact.lastName) || '').trim();
      const first = String((p.contact && p.contact.firstName) || '').trim();
      const company = String((p.contact && p.contact.company) || '').trim();
      const name = ent || last || first || company;
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
    return names.join(' & ');
  };
  return [side('Client-Buyer'), side('Client-Seller')].filter(Boolean).join(' / ');
}
