# CRM-FEED-1: portal orders feed the CRM; Zoho deals link instead of duplicating

Requester: John Coester. Source: John chat 9:09 PM Nov 25 2026 (TEST, aqcervntopidtcazcmlv). Addition the same night: Janine
may import Zoho deals herself, and those must not become a second deal for an order already in the portal.

The CRM starts fresh in the portal. There is no one-time Zoho import of the whole CRM.

## What already worked (no change)

| Portal | CRM | How |
| --- | --- | --- |
| Order (`public.deals`) | Deal | CRM Deals reads `public.deals` through `public.crm_deals()` / `private.crm_deal_row()`. The CRM deal id is the order id. A new order is a CRM deal as soon as it is saved. |
| Buyer / seller (`deal_participants` Client-Buyer / Client-Seller -> `public.contacts`) | Client | CRM Clients are `public.contacts`. `private.crm_in_pool()` includes every contact that is not a CLA staff login. The deal's Client column comes from these parties. |
| Agents, lender contact, other parties (`public.contacts`) | Client (with their contact type) | Same contacts table. `contacts_person_dup` already refuses a second contact with the same email or phone when the order adds a party. |
| Brokerage / lender name | Company name text | Shown from `contacts.company` (and `deals.lender_name` on the order). Not linked to `crm_accounts`; see open questions. |

So no trigger is needed to "copy" an order into the CRM, and there is nothing to backfill: every existing TEST order is already in CRM Deals.

## What this adds

1. **Deals import** (`#/crm/import/deals`, Admin / Super admin, linked from CRM Deals). It reads a Zoho Deals export (CSV or Excel), maps the Zoho headers, previews, then imports. Imported rows go to `public.crm_imported_deals`.
   The existing import (PR 94) only takes Leads, Clients and Notes; it never had a Deals module.
2. **Match rule** (the same when Janine imports and when an order is opened later):
   1. **File number**: trimmed, upper case, spaces removed, equal to the order's file number. Else
   2. **Property address + client**: the normalized street + city + state are equal, and the imported client is a Client-Buyer or Client-Seller on the order (same contact by email, or the same normalized name).
      Address normalizing: lower case; `. , # ; :` become spaces; spaces collapsed; street, avenue (av), road, drive, lane, boulevard, court, circle, place, terrace, parkway, highway, north, south, east, west become st, ave, rd, dr, ln, blvd, ct, cir, pl, ter, pkwy, hwy, n, s, e, w. ZIP is not compared (Zoho exports often leave it out or use ZIP+4).
      A row whose own file number is on another order is not matched by address.
   3. **Exactly one candidate**: the Zoho deal is linked to the order (`deal_id`). The order stays the only CRM deal; the list shows a "Zoho" tag on it.
   4. **No candidate**: the Zoho deal is kept as its own CRM deal row ("Zoho import"). If the order is opened later, it links then (file number on save, address + client when the buyer or seller is added, and again if the file number or address changes).
   5. **More than one candidate** (two orders fit one Zoho deal, or two Zoho deals fit one order): nothing is linked. The Zoho deal is imported and flagged **Needs review**, and it is never linked automatically after that.
      Chosen behaviour: *import and flag*, not *skip and flag*. Skipping would drop Janine's Zoho history for that deal and make her re-import it; a flagged row is visible on CRM Deals and in the import summary, and the order is never touched.
   6. Demo and non-demo never match (`is_demo` must be equal), the same separation the rest of the portal uses.
3. **Idempotent**: a row already imported (same Zoho record id, else same file number, else same address + client with no file number) is a Duplicate and skipped, so running the same file twice adds nothing. Relinking every order again changes nothing.
4. **CRM Deals list**: one more call (`crm_imported_deals_list`) at the same time as the orders call. Linked Zoho deals add a tag to the order row; unlinked ones are their own rows (not openable, not bulk-selectable). Unlinked rows are hidden when a Deal Owner, Client or Source filter is set, because they have no portal owner, client link or source. A Sales Person sees only Zoho deals linked to orders they are on. Until the migration is applied, that call fails quietly and the list is the orders alone.

## Database (migration `20261131290000_crm_portal_deal_feed.sql`, rollback in `supabase/rollbacks/`)

- New: `public.crm_imported_deals` (RLS on, no policy, no table grant), three pure key functions (`private.crm_file_key`, `private.crm_addr_key`, `private.crm_name_key`), `private.crm_imported_deal_link(uuid)`, two trigger functions, `public.crm_import_deals(...)` and `public.crm_imported_deals_list()` (SECURITY DEFINER, access checked once per call, `search_path` pinned, revoked from public / anon).
- New triggers: `zz_crm_imported_deal_link` (after insert on deals), `zz_crm_imported_deal_relink` (after update of file_number / street / city / state, only when one changed), `zz_crm_imported_deal_party` (after insert of a Client-Buyer / Client-Seller party).
  Each returns at once when no imported deal is waiting, and runs the link in its own exception block, so a CRM problem can never stop an order or a party from being saved.
- New index on orders: `deals_crm_addr_key_idx` on `private.crm_addr_key(street, city, state)`. The file-number match uses the existing unique `deals_file_number_key`.
- Nothing existing is replaced. No change to any policy, shared helper, or the deals / tasks / profiles policies. Drift guards refuse if any new name already exists or a column the SQL reads is missing.

## Speed (local scratch Postgres 17, 110,000 orders, 110,000 participants, 110,000 waiting imported deals)

- Order insert overhead: about 0.05 ms per order with nothing to link, about 0.13 ms when an address candidate exists (200 inserts: 7.6 ms without the triggers, 18.7 ms and 26.2 ms with them).
- A 500-row import preview with address + client matching: about 0.17 s.
- Each partial-index lookup repeats the index predicate (for example `file_key <> ''`) so the cached plan inside plpgsql uses the index. Without that, the same 500 rows took 150 s.

## Tests

- `test/test-crm-feed-sql.sh` (disposable local Postgres only): file-number match, address + client match, no match, ambiguous both ways, idempotent re-run (import and relink), preview saves nothing, forward links on order insert and when the client is added, demo separation, Sales Person scope, grants, a failing link does not block an order, deleting an order unlinks, index use, rollback leaves orders alone, second apply stops on the drift guard.
- `test/test-crm-imported-deals.js` (network off): list merge, status mapping, filters, chunking, Zoho header mapping, the hosted adapter calls, the pages, and the migration text rules.

## Backfill

None. Every existing TEST order is already a CRM deal and every party is already a CRM client. The new table starts empty, so there is nothing to link.

## Open questions

- **Picking the order for a Needs review row.** This PR flags it; it has no "link to this order" or "not a match" button yet. Proposed follow-up: an admin-only pick on the row.
- **Companies.** Brokerage and lender names stay as text on the contact and the order. Linking them to CRM Companies automatically is left out: the existing CRM guard lets only CRM editors change a contact's company link, so the Processor or agent who opens an order cannot do it from a trigger, and free-text names would make duplicate companies. Proposed follow-up: link by the existing company-name key when an admin runs it, or when a CRM editor opens the client.
- **Import history.** Deal imports are not listed in the Leads / Clients import history (`crm_imports` only allows those modules, and this PR does not change that table).
- **Preview across chunks.** Duplicates within one file are caught inside each 500-row chunk in a preview; on Import every chunk sees the rows before it.
