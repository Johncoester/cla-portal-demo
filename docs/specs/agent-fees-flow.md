# Agent fees flow (commissions, admin fees, other agent fees)

**Requested by:** John Coester, Nov 12 2026 (chat t1542u).
**Status:** AF-1 to AF-6 Live on TEST. AF-7 is on TEST but not Live until the permission follow-up is applied and Place Order is checked there. See [ROADMAP.md](../../ROADMAP.md#agent-fees-flow).
**Audit:** Grok, Nov 12 2026, against main `3966fd07` and the TEST database (read only).

## What John asked for

### 1. File opening → portal sync
When staff open a file and enter agent commissions, admin fees or other agent fees, those values automatically appear on the agent's portal view of that file.

### 2. Agent values win
Once an agent confirms a fee, it's the source of truth. Staff can still change it, but only after entering a required reason. The agent is notified right away (old value, new value, reason, who changed it) and can override it again from the portal. Keep a full audit log of every change: who, when, old value, new value, reason, and source (staff or agent).

### 3. Agent override with confirmation
The agent can edit their own fees in the portal. On save, show a confirmation screen ("You're changing X from $A to $B"). Confirmed agent values are flagged "Agent confirmed." Notify the assigned CLA processor of the change.

### 4. Accounting tab
The final fees post automatically to the correct lines in the file's Accounting tab (commission split by listing/selling side, admin fees, other fees) as soon as a value is set or changed.

### 5. CD / ALTA generation
Clicking "Generate CD" or "Generate ALTA" pulls these fees from the Accounting tab into the correct sections. No re-entry.

### Tests John asked for
Add tests for each requirement, including:
- a staff change that requires a reason and notifies the agent,
- an agent override,
- the values appearing on the generated CD and ALTA.

Every pull request follows the Build standards (AGENTS.md rules 10-16): a plain-English description with what was asked, what it does, how to test it and what's not done.

## Decisions

Recorded so far:

- Agent-confirmed fees win. Staff changes need a reason and notify the agent.
- Agents never write fee tables directly, only through a server function checked against their own side.

Answers from John, Nov 12 2026, 2:33 PM ET (chat t1544u):

1. **Commission is % or $, always in sync.** The agent can enter the commission as a percent or a dollar amount. Changing the % recalculates the $ from the sales price, and changing the $ recalculates the %. They can never differ.
2. **Fields for each agent side (listing agent and buyer's agent):**
   - Commission: % and $, kept in sync.
   - Admin fee, next to or below the commission. By default the buyer pays the buyer's agent admin fee and the seller pays the listing agent admin fee. Who pays can be changed per file.
   - Other fees: a section with a + button, up to 5 fees, each with a typed description, an amount and who it's paid to (for example, the brokerage).
   - All of these post automatically to the correct Accounting lines.
3. **A staff change to an agent-confirmed fee only notifies the agent.** There's no re-approval and no review step.
4. **When an agent changes a fee,** the processor, pre-processor and TC on the file are notified, both in the portal and by email.
5. **Buyers and sellers do not see** commissions or agent fees in the portal.
6. **CD and ALTA:** keep the existing Closing Disclosure and Settlement Statement tabs (view and print), and add "Generate CD" and "Generate ALTA" buttons that create a PDF.
7. **A TC can confirm fees for the agent.** It's logged as confirmed by the TC, and the agent is notified.

## Current state (audit, Nov 12 2026)

Commissions are stored in two places that don't feed each other. Staff enter them on the order. Agents enter theirs in the "Confirm Your Transaction Information" task, which saves them on the task only. On TEST, no file has commission values yet, there are no commission lines on the fee ledger, and none of the 4 open agent transaction-info tasks has been submitted.

### 1. File opening → portal sync: Partial

| Piece | Where | Status |
|---|---|---|
| Staff enter commission base, %, additional, total and "Paid by" (Buyer or Seller) | Place Order `js/pages/ordernew.js` (Earnest & Commissions, lines 157-164); Edit order details `js/pages/deal.js` line 258; Accounting > Contract figures `js/pages/dealaccounting-contract.js` lines 12-39; TC contract `js/data/supabase-tc.js` (calls `update_tc_contract`) | Done |
| Storage | `js/data/earnest-commission.js` (`earnestDealPatch`, `earnestView`). Table `deals`: `listing_commission_pct`, `listing_commission_amount`, `buyer_commission_pct`, `buyer_commission_amount`, `financial` (jsonb). Migration `supabase/migrations/20261110200000_parcel_earnest_financial.sql`. Also `accounting_contract_terms` (listing and buyer-broker % and $). | Columns are on TEST. This migration isn't in TEST's migration history (applied as plain SQL). |
| Both sides' commission at once | "Paid by" picks one side; saving blanks the other side's columns | Partial |
| Admin fee or "other agent fees" boxes for staff | None (`js/data/fee-engine.js` has an internal `brokerAdminFee: 0` only) | Missing |
| Agent can read the figures (database) | `deals` policy `deals_select` lets anyone on the file read the row, commission columns included. Agents can't update it (`deals_update` needs `can_run_deal`). | Readable |
| Agent can see the figures (screen) | The overview's "Earnest & commissions" box (`js/pages/deal.js` lines 181 and 302-311) isn't limited to staff, so agents and buyers and sellers would see it. It shows one total, not one per side. | Partial |
| Agent task pre-filled from staff figures | The demo pre-fills closing date, price and EMD only (`js/data/mock-part-agent.js` line 28). On TEST, `get_agent_task` returns saved answers only. | Missing |
| Agent access to Accounting | `private.acct_reader` / `private.acct_editor` allow only staff roles | Not allowed, as intended |

### 2. Agent values win: Missing, with pieces to build on

| Piece | Where | Status |
|---|---|---|
| "Agent confirmed" flag | None | Missing |
| Required reason for a staff change | None for fees | Missing |
| History of changes | `accounting_fee_log` (old and new row, who, when, filled by the `acct_fee_log` trigger, no reason); `agent_task_revisions` (every agent submission); `activity_log` (text only); `accounting_contract_terms_log` | Partial. There's no one log with old, new, reason and source. |
| Telling the agent | `notifications` table and `private.notify(...)`, read through `my_notifications`. In-portal only, no email. | Exists, not used for fees |
| Agent overrides again | The agent can resubmit the task (each version kept), but it doesn't change the order | Partial |

### 3. Agent override with confirmation: Partial

| Piece | Where | Status |
|---|---|---|
| Agent edits their fees | `js/pages/dealagenttask.js` lines 22-24 and 42; checks in `js/data/agent-portal.js` lines 66-78 (percent 0-100, needs a percent or an amount; each fee or credit needs a name, Fee or Credit, amount, Buyer or Seller) | Done, saved on the task only |
| Submit and keep every version | `submit_agent_task` → `private.rpc_submit_agent_task`: only the task's own agent can submit; writes `agent_task_revisions` and `tasks.form_data`; logs activity | Done on TEST |
| Telling the processor | The same function notifies `deals.processor_id` in the portal ("X completed/revised …") | Done, in-portal only, doesn't say what changed |
| "You're changing X from $A to $B" screen | None | Missing |
| "Agent confirmed" label | None | Missing |
| Agent's figures flow to the order and Accounting | None | Missing |

### 4. Accounting tab: Missing (manual today)

| Piece | Where | Status |
|---|---|---|
| Fee ledger | Table `accounting_fees` (`alta_section`, `cd_section`, `cd_line`, `paid_by`, `split_*`, `payee`, `preset_key`, `overridden`, `retired_at`), access through `acct_reader` / `acct_editor` | Exists |
| Commission line | ALTA section `commission` → CD section H (`js/data/accounting.js` lines 30-43); a manual example "Real estate commission" (`js/data/accounting.js` line 332); not covered by the fee calculator (`js/data/fee-engine.js` line 179) | Manual only |
| Automatic posting | None. Accounting > Contract figures says outright that "the fee ledger does not import them" (`js/pages/dealaccounting-contract.js` line 76). Payoffs already post their own ledger line with `preset_key` (`js/data/supabase-payoffs.js` line 27), which is the pattern to copy. | Missing |
| Split by listing and selling side, admin fees, other fees | None | Missing |

### 5. CD / ALTA generation: Partial

| Piece | Where | Status |
|---|---|---|
| "Generate CD" / "Generate ALTA" buttons | None. Accounting has live Closing Disclosure and Settlement Statement tabs instead (`js/pages/dealaccounting-charges.js` line 34; `js/pages/dealaccounting-cd.js`; `altaStatement()` in `js/data/accounting.js` line 209), built from the ledger and printable. | Live views, no button |
| Commission on CD page 2 section H and the ALTA Commission section | Shows once a commission line is on the ledger. CD page 5 already names the buyer-side and seller-side brokers (`js/pages/dealaccounting-cd.js` lines 80-81). | Works once requirement 4 is built |
| Saved CD details | Tables `accounting_cd_details`, `accounting_cd_log` | Exists |

### Existing tests in this area

- Unit and SQL: `test/test-earnest-accounting-sync.js`, `test/test-accounting-contract.js`, `test/test-accounting-contract-sql.sh`, `test/test-parcel-earnest-sql.sh`, `test/test-money-save.js`, `test/test-agent-task-submit.js`, `test/test-agent-francis.js`, `test/test-accounting-flags-order.js`, `test/test-spouse-parcel-accounting.js`, `test/sql/agent-portal/fixture.sql`, `test/sql/agent-portal/checks.sql`.
- Walkthrough (e2e-roles): only `tests/e2e-roles/specs/order-entry.spec.js` touches commissions, at entry. Nothing covers an agent submitting fees, Accounting posting or the CD/ALTA.

### Old PHP portal (reference only)

`application/views/commission_information.php` was a per-agent "Commission Information" form: buyer-agent and listing-agent %, base, "Paid by", and "Additional Fee/Admin Fee Paid by Buyer $". Every agent did their own commission task, and a linked TC took over the agent's task (`tests/commission_side_test.php`).

## Proposed build (one tracker row and one pull request each, AGENTS.md rules 2-3)

Adjusted to John's Nov 12 answers.

| Row | What | Database file? |
|---|---|---|
| AF-1 | Fee records and change history. For each agent side (listing and buyer's agent): commission % and $ (always in sync, using the sales price), an admin fee with who pays it (default: buyer for the buyer's agent, seller for the listing agent, changeable per file), and up to 5 other fees (description, amount, paid to). Each fee records its source (staff, agent or TC) and who confirmed it and when. A history keeps who, when, old, new, reason and source. A server function requires a reason when staff change an agent-confirmed fee. | Yes |
| AF-2 | Staff entry and agent view. Staff enter these fields when opening or editing the file. Each agent sees and edits their own side only. Buyers and sellers never see commissions or agent fees, so the overview's "Earnest & commissions" box is hidden from them. The agent task is pre-filled from the staff figures. | Yes (access rules) |
| AF-3 | Agent or TC changes. The "You're changing X from $A to $B" confirmation screen, the "Agent confirmed" label (or "Confirmed by TC" when a TC confirms for the agent, and then the agent is notified). Saving notifies the processor, pre-processor and TC on the file, in the portal and by email. | Yes |
| AF-4 | Telling the agent about a staff change: old value, new value, reason and who, in the portal and by email. Notification only, with no re-approval. | Maybe |
| AF-5 | Fees post to Accounting automatically, one ledger line per side and fee (commission, admin fee with its payer, each other fee with its payee), the same way payoffs do, without overwriting a line a processor overrode. | Yes |
| AF-6 | "Generate CD" and "Generate ALTA" buttons that create a PDF from the Accounting ledger, alongside the existing live tabs. Tests show the fees in CD section H and the ALTA Commission section. | Maybe (to store the PDF) |

**Risks:** agents and TCs changing money figures (every write goes through a checked server function, never directly into a table); buyers and sellers can read the commission columns today, which has to change; the same figure stored in three places unless AF-1 replaces the older ones; % and $ rounding must never leave them out of step; email notices depend on Gmail sending working; Accounting has to stay switched on for AF-5; automatic lines must respect a processor's manual override.

**Where it sits:** John's hold applies (AGENTS.md rule 9). No new feature starts until the e2e-roles walkthrough on main is green, which needs Gmail connected for the E2E Processor. Agent fees stays behind FF-055 and the work confirmed today.

## AF-1 as built (database)

Migration `supabase/migrations/20261117100000_agent_fees.sql` (rollback in `supabase/rollbacks/`), test `test/test-agent-fees-sql.sh`.

- `deal_agent_fees`: one row per file, side (`listing`, `buyer`), kind (`commission`, `admin`, `other`) and slot (0, or 1-5 for other fees). Commission rows keep a `basis` (`percent` or `amount`, whichever was typed), `pct` (8 decimals) and `amount` (cents). Every row has `payer` (`buyer` or `seller`; default buyer on the buyer's agent side, seller on the listing side), `source` (`staff`, `agent`, `tc`, `system`) and `confirmed_by` / `confirmed_role` (`agent` or `tc`) / `confirmed_at`.
- `deal_agent_fee_log`: every change with old and new value (JSON), reason, source, who and when. Confirming an unchanged value is logged with reason "Confirmed".
- Nobody reads or writes the tables directly (no grants, row security on). Functions: `agent_fees(deal)` and `agent_fee_history(deal)` return what the caller may see (staff who can open the file: both sides; an agent: their side; a TC: the side of an agent they coordinate for, or both sides if they're the file's TC; buyers and sellers: nothing). `save_agent_fees(deal, side, fees, reason)` replaces one side's fees, checks every value with plain messages, and needs a reason (3+ characters) when staff change or remove a fee an agent or TC confirmed. An agent or TC saving confirms every fee on their side. Staff saving keeps the confirmation record (no re-approval, Decision 3).
- A trigger on `deals.purchase_price` works each commission out again from its basis and logs it as `system`.
- Not yet used by any screen (AF-2). The older commission columns on `deals` are untouched until AF-2 moves the screens over.

## AF-2 as built (Agent fees box)

Migration `supabase/migrations/20261118010000_agent_fee_sides.sql` adds `agent_fee_sides(deal)`: the sides the caller may see, with `read` or `edit` (none for buyers, sellers or a refinance).

- `js/data/agent-fees.js`: the shared rules (% and $ from the sales price, payer defaults, other-fee checks, plain error messages). `js/data/supabase-agent-fees.js` calls the database functions; `js/data/mock-part-agent-fees.js` is the demo copy with the same rules.
- `js/pages/agent-fees-box.js`: the box on the file overview (`js/pages/deal.js`), loaded alongside the overview's other reads. It shows nothing when the viewer has no side, the file is a refinance, or the database functions aren't there.
- Tests: `test/test-agent-fees.js` (rules and the demo adapter), `test/test-agent-fees-sql.sh` (AF-1 and the sides function).

## AF-3 as built (agent and TC changes, notices to the CLA team)

Migration `supabase/migrations/20261118020000_agent_fee_notify.sql` re-creates `save_agent_fees` so that a save by an agent or TC calls `private.agent_fee_notify`: one portal notice (kind `agent_fee`, link to the file) to the file's processor, pre-processor and TC, plus the side's agents when a TC saved. The notice names who, the file, and each change as old → new. One email per person is queued in `public.outbox` (subject "Agent fees changed on <file>" or "Agent fees confirmed on <file>"). The TEST portal never sends outbox email.

- The box (`js/pages/agent-fees-box.js`) shows the agent or TC a check screen before saving: "You're changing … from $A to $B", "Yes, save and confirm", "Go back" (keeps what was typed). The TC's overview (`renderTcOverview` in `js/pages/deal.js`) now shows the box.
- `feeText` / `feeChanges` in `js/data/agent-fees.js` build the old → new lines for the check screen; the database builds the same text for notices.

## AF-4 as built (agent told about staff changes)

Migration `supabase/migrations/20261118030000_agent_fee_staff_notice.sql` re-creates `private.agent_fee_notify` with a staff branch: when CLA staff change a side that was confirmed (or give a reason), only that side's agents get the portal notice ("<name> (CLA Title) changed your fees on <file>: … Reason: …") and a queued email saying no approval is needed. The demo adapter does the same.

## AF-5 as built (posting to Accounting)

Migration `supabase/migrations/20261118040000_agent_fee_ledger.sql` adds a trigger on `deal_agent_fees` (`private.agent_fee_ledger_sync`) and a link table `deal_agent_fee_ledger` (fee → ledger line, plus what was last posted). Each fee keeps one `accounting_fees` line: kind charge, ALTA `commission`, CD `H`, `preset_key` `agent_fee:<side>:<kind>:<slot>`, paid by the fee's payer (the whole amount on that side). A $0 or removed fee retires its line. A line whose description, payee, amount or payer no longer match what was last posted was changed by hand and is left alone. The ledger's own guard and history triggers still run, so the Accounting history shows each automatic change. `agentFeeLedgerInput` in `js/data/agent-fees.js` builds the same line for the demo adapter.

## AF-6 as built (Generate CD / Generate ALTA)

The Print buttons on Accounting's CD and Settlement Statement tabs (`js/pages/dealaccounting.js`, `js/pages/dealaccounting-cd.js`) are now **Generate CD** and **Generate ALTA**. They set the document name to "<file> - Closing Disclosure - TEST" / "<file> - ALTA Settlement Statement - TEST" and open the print window, where "Save as PDF" makes the file. The PDF is what the live tab shows (still marked TEST). `test/test-agent-fees.js` checks that posted agent fees appear in CD section H and the ALTA Commission section.

## Open questions (resolved Nov 12 2026 by John)

All seven were answered at 2:33 PM ET (t1544u). The answers are recorded under Decisions above.

1. ~~Does the agent set the commission %, the $ amount, or either one?~~ Either. They stay in sync (Decision 1).
2. ~~What counts as an "other agent fee"? Is the admin fee per side?~~ Admin fee per side, plus up to 5 other fees (Decision 2).
3. ~~Does a staff change need the agent's re-approval?~~ No, the agent is just notified (Decision 3).
4. ~~Who is told when an agent changes a fee, and how?~~ The processor, pre-processor and TC, in the portal and by email (Decision 4).
5. ~~Should buyers and sellers see commissions?~~ No (Decision 5).
6. ~~Generate buttons or live tabs?~~ Both. Keep the tabs and add PDF buttons (Decision 6).
7. ~~Can a TC confirm fees for the agent?~~ Yes, logged as confirmed by the TC, and the agent is notified (Decision 7).

## Follow-ups as built (AF-7, John Nov 13 2026; assigned to Claude)

What John asked (Nov 13): make the older commission boxes use the Agent fees records so there is one source, and lock the order's old commission fields so buyers and sellers can't read them; remove the commission and fee questions from the agent's "Confirm Your Transaction Information" task; add a walkthrough test; AF-1 choices approved as written.

- **One place.** Agent fees are the only home for commissions. Place Order has, per agent side, Commission % / $ (kept in step with the purchase price typed on the form) and an admin fee (`placeOrderFeesHtml` / `readPlaceOrderFees` in `js/pages/agent-fees-box.js`); they are saved with `saveAgentFees` after the agents are added, so the Accounting line names the agent's company. A failure there doesn't lose the order: Place Order lists it and says to use the Agent fees box. Edit order details, Accounting > Contract figures and the TC's contract figures no longer take a commission: they point to the Agent fees box (`agentFeesPointer`), and Accounting shows both sides read only (`agentFeesSummaryHtml`). Editing after opening happens in one place, the box, so the reason rule and the agent's confirmation screen can't be skipped from another form.
- **Database** (`supabase/migrations/20261119030000_agent_fee_one_source.sql`, rollback in `supabase/rollbacks/`): moves any commission still on an order (the four `deals` commission columns and the commission keys of `deals.financial`) into `deal_agent_fees` as a staff entry, unless that side already has one; every move, and any figure that couldn't be moved (no sales price, or above the price), is in the change history. Then it empties those fields and adds a guard that refuses a commission written to the order with "Commissions are now kept in the Agent fees box on the file overview. Reload the page and enter them there. Nothing was saved." EMD held by stays. The demo adapter refuses the same way. That file also took away the signed-in user's right to run the key list the guard calls, so on TEST every save of an order failed with a permission error. `supabase/migrations/20261119180000_old_commission_keys_permissions.sql` (rollback alongside it; [PR 259](https://github.com/Johncoester/cla-portal-demo/pull/259)) gives that right back, keeps the same nine keys, and does not mark AF-7 Live. It is not applied on TEST by the pull request.
- **Agent task:** no commission splits and no fees/credits rows; a note points to the Agent fees box. Answers already submitted are still shown.
- **Contract sheet:** the Buyer broker % / $ and Listing commission % / $ boxes are gone; the group is "Seller credit".
- **Tests:** `test/test-agent-fees-sql.sh` (move, history, guard, rollback, and a signed-in insert and update that must not get a permission error), `test/test-agent-fees-one-place.js`, `test/test-earnest-accounting-sync.js` (rewritten for one place), walkthrough `tests/e2e-roles/specs/agent-fees.spec.js` and Place Order agent fees in `order-entry.spec.js`.

