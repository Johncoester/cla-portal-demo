# CRM search results open the record

**Requested by:** Janine Santos, CRM Feedback 39. Video: Drive file 1VRilAQ7JTZirY-5HgV4TVaP_ev-An0mZ. Confirmed by email "Yes, that's it" on Nov 24 2026, 1:20 PM ET, including the full name and a faster search.

**Status:** In progress. Not Live until this is merged and someone checks it on TEST. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On CRM Search Results (`#/crm/search/...`), the record name is a link. It opens that record at the same address the suggestion in the top search box already uses.

- Clients open at `#/crm/contacts/<id>`
- Leads open at `#/crm/leads/<id>`
- Companies open at `#/crm/accounts/<id>`
- Deals open at `#/crm/deals/<id>`
- Tasks, meetings, and calls open at `#/crm/tasks/<id>`, `#/crm/meetings/<id>`, and `#/crm/calls/<id>`

A client or lead shows the first and last name (Brendan Gallagher), not only the last name. A company shows its company name. A deal shows the property address, the same name the deal page uses.

## What this does not change

No database change. The contact, company, and deal lists are still the same reads. Search no longer asks for last-activity rows, and it asks for the modules together instead of one after another. The header box still waits 200 milliseconds after a keystroke before it searches.
