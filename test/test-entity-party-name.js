/* FF-012. An entity buyer and an entity seller are shown by the entity name.
 * An individual stays first and last. Fake data only. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileTitleOf, partyDisplayName } from '../js/data/party-name.js';

let fail = 0;
const ok = (c, m) => { if (c) console.log('ok', m); else { fail++; console.log('FAIL', m); } };

const entityBuyer = {
  role: 'Client-Buyer',
  contact: { firstName: 'Warren', lastName: 'Spencer', company: 'Spencer LLC' },
  entity: { name: 'Spencer LLC', type: 'LLC', repName: 'Warren Spencer' },
};
const entitySeller = {
  role: 'Client-Seller',
  contact: { firstName: 'Oak', lastName: 'Trustee', company: 'Oak Trust' },
  entity: { name: 'Oak Trust', type: 'Trust', repName: 'Oak Trustee' },
};
const person = {
  role: 'Client-Seller',
  contact: { firstName: 'Sally', lastName: 'Seller', company: '' },
  entity: null,
};
const agent = {
  role: 'Buyer Agent',
  contact: { firstName: 'Bianca', lastName: 'Buyer-Agent', company: 'Harbor Realty' },
  entity: { name: 'Should Not Replace The Agent' },
};

ok(partyDisplayName(entityBuyer) === 'Spencer LLC' && !partyDisplayName(entityBuyer).includes('Warren'), 'an entity buyer is the entity name, not the representative');
ok(partyDisplayName(entitySeller) === 'Oak Trust' && !partyDisplayName(entitySeller).includes('Trustee'), 'an entity seller is the entity name, not the representative');
ok(partyDisplayName(person) === 'Sally Seller', 'an individual is still first and last');
ok(partyDisplayName(agent) === 'Bianca Buyer-Agent', 'an agent keeps the person name');
ok(fileTitleOf([entityBuyer, entitySeller]) === 'Spencer LLC / Oak Trust', 'the order title names both entities');
ok(fileTitleOf([entityBuyer, person]) === 'Spencer LLC / Seller', 'an entity buyer and an individual seller share one title');
ok(fileTitleOf([{ role: 'Client-Buyer', contact: { firstName: 'Ben', lastName: 'Buyer' } }, person]) === 'Buyer / Seller', 'two individuals stay last names');

const cards = readFileSync('js/pages/theme-cards.js', 'utf8');
const mail = readFileSync('js/pages/dealemail.js', 'utf8');
const deal = readFileSync('js/pages/deal.js', 'utf8');
ok(cards.includes('partyDisplayName(p)') && mail.includes('partyDisplayName(p)') && deal.includes('partyDisplayName(p)'), 'the order summary, the email party, and the invite use the same party name');

const sql = readFileSync('supabase/migrations/20261116020000_entity_party_names.sql', 'utf8');
const roll = readFileSync('supabase/rollbacks/20261116020000_entity_party_names.sql', 'utf8');
const titles = readFileSync('supabase/migrations/20261112060100_entity_file_titles.sql', 'utf8');
ok(sql.includes('private.file_title') && sql.includes('private.deal_party_names') && sql.includes('participant_entities') && sql.includes("dp.role in ('Client-Buyer', 'Client-Seller')") && sql.includes('c.first_name'), 'search names and the older file title prefer the entity and still keep a person name');
ok(roll.includes("trim(c.first_name || ' ' || c.last_name)") && !roll.includes('participant_entities'), 'the rollback restores first and last');
ok(titles.includes('participant_entities') && titles.includes('deal_file_titles'), 'Open Orders keeps the entity name from deal_file_titles');
console.log('entity-party-names-sha256', createHash('sha256').update(sql).digest('hex'));
console.log('entity-party-names-rollback-sha256', createHash('sha256').update(roll).digest('hex'));

if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('entity party names passed');
