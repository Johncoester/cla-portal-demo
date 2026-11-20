# CLA Title Portal roadmap

This file lists the portal's major features: how each one should work, how far along it is, and what is left to do. It is written for the whole team, not only developers.

**What the statuses mean**

- **Planned**: agreed or requested, but nothing has been built yet.
- **In progress**: someone is building it now, with an open pull request.
- **Partial**: some of it works on TEST, and some of it is still missing.
- **Done**: everything described works on TEST and has been checked there.

**The rule:** every pull request that touches a feature updates this file in the same pull request: its status, what's built, what's missing, the pull request link and any new decisions (AGENTS.md rule 22). The full write-up for each feature lives in [docs/specs/](docs/specs/), one file per feature.

---

## Agent fees flow

**How it should work.** When CLA staff open a file, they enter each agent's fees for their side (listing agent and buyer's agent): the commission as a percent or a dollar amount, which always stay in sync with each other using the sales price; an admin fee (paid by the buyer for the buyer's agent and by the seller for the listing agent unless changed); and up to 5 other fees, each with a description, an amount and who it's paid to. Each agent sees and can change their own side in the portal. Before saving, they see a "You're changing X from $A to $B" check, and the fee is then marked "Agent confirmed". A TC can confirm for the agent. Once confirmed, the agent's figure wins. Staff can still change it, but they must give a reason, and the agent is told straight away (old value, new value, reason, who). When an agent changes a fee, the processor, pre-processor and TC on the file are told, in the portal and by email. The fees go straight onto the right lines in Accounting, and from there onto the Closing Disclosure (CD) and the ALTA settlement statement, which can also be generated as PDFs. Buyers and sellers never see commissions or agent fees. Every change is kept in a history: who, when, old value, new value, reason, and whether staff, the agent or the TC made it.

**Status: Built (AF-1 to AF-7 Live on TEST as of Nov 13 2026, fix [PR 259](https://github.com/Johncoester/cla-portal-demo/pull/259); AF-8 Live on TEST as of Nov 14 2026, [PR 274](https://github.com/Johncoester/cla-portal-demo/pull/274)).**

| Step | What | Status |
|---|---|---|
| AF-1 | Fee records and change history (database only) | Live on TEST, [PR 225](https://github.com/Johncoester/cla-portal-demo/pull/225) |
| AF-2 | Staff entry and agent view; buyers and sellers can't see fees | Live on TEST, [PR 227](https://github.com/Johncoester/cla-portal-demo/pull/227) |
| AF-3 | Agent or TC changes: "You're changing X from $A to $B", "Agent confirmed", notices to staff | Live on TEST, [PR 235](https://github.com/Johncoester/cla-portal-demo/pull/235) |
| AF-4 | Notice to the agent when staff change a confirmed fee | Live on TEST, [PR 236](https://github.com/Johncoester/cla-portal-demo/pull/236) |
| AF-5 | Fees post to Accounting automatically | Live on TEST, [PR 237](https://github.com/Johncoester/cla-portal-demo/pull/237) |
| AF-6 | "Generate CD" and "Generate ALTA" PDF buttons | Live on TEST, [PR 238](https://github.com/Johncoester/cla-portal-demo/pull/238) |
| AF-7 | Follow-ups: one place for commissions, agent task without fee questions, walkthrough test (Owner: Claude) | Live on TEST, Nov 13 2026. [PR 257](https://github.com/Johncoester/cla-portal-demo/pull/257) + fix [PR 259](https://github.com/Johncoester/cla-portal-demo/pull/259), migrations 20261119030000 and 20261119180000 applied on TEST |
| AF-8 | The old "Commission information" agent task goes through Agent fees (Owner: Claude) | Live on TEST, Nov 14 2026. [PR 274](https://github.com/Johncoester/cla-portal-demo/pull/274), migration 20261123010000 applied on TEST |

**What's built**

- AF-1 (database only, nothing on screen yet): each file keeps, per agent side, a commission (% and $ always in step with the sales price), an admin fee with who pays it, and up to 5 other fees. Each fee records whether staff, the agent or a TC set it, and who confirmed it and when. A history keeps who, when, old value, new value, reason and source. Staff can't change a fee the agent or TC confirmed without a reason. When the sales price changes, each commission is worked out again and the change goes in the history.
- AF-2: an **Agent fees** box. Processors (and pre-processors on their files, and admins) see both agent sides and can edit them; other CLA staff on the file see them read only; each agent sees and edits only their own side; buyers and sellers never see it. In the edit window, typing the commission % fills in the $ (or the other way round) from the sales price. Admin fee with Paid by, up to 5 other fees (description, amount, paid to, paid by). When the agent confirmed the side, staff must type a reason before saving. A "Change history" button lists every change (when, who, was, now, reason). The box shows "Not confirmed by the agent yet", "Agent confirmed", "Confirmed by TC", or "Agent confirmed, then changed by CLA staff".
- FF-101c (Francis Nov 18 11 AM meeting notes, confirmed by John Nov 18 2:13 PM ET): the Agent fees box is no longer on File Overview. The listing agent's commission sits under **Listing (Seller's) Agent tasks**, and the buyer's agent commission sits under **Buyer's Agent tasks**, for every role that used to see them on the overview (staff, agents, TCs). Accounting still shows a read-only summary. Commission fields are unchanged (broker fee / payout is FF-101b).
- AF-3: when an agent (or a TC for the agent) saves, they first see "You're changing … from $A to $B" (or "You're confirming these fees as they are"), with "Yes, save and confirm" and "Go back" (which keeps what they typed). Saving marks the side "Agent confirmed" or "Confirmed by TC". The TC sees Agent fees under the agent task sections on Tasks. When an agent or TC changes or confirms fees, the file's processor, pre-processor and TC get a portal notice (who, the file, old and new values) and an email is queued for each. When a TC confirms, the side's agent is told too.
- AF-4: when CLA staff change fees the agent (or TC) confirmed, the side's agent gets a portal notice and a queued email: who changed it (marked "CLA Title"), old and new values, and the reason. It says no re-approval is needed. Nobody else is told, and nothing is sent when staff change fees nobody has confirmed yet.
- AF-5: every agent fee posts to the file's Accounting fee ledger by itself. Each fee is one line under ALTA "Commission" and CD section H, paid by the fee's payer. The payee is the agent's company (or "Buyer's Agent" / "Listing Agent" when it has none), or the other fee's "paid to". A line is kept in step when the fee or the sales price changes, and retired (never deleted) when the fee is removed. If a processor changes the line by hand on the Accounting tab, automatic posting leaves it alone from then on.
- AF-6: Accounting's Closing Disclosure and Settlement Statement tabs stay, and each has a **Generate CD** / **Generate ALTA** button. It opens the print window with the file's document name filled in (for example "MD-26-97262 - Closing Disclosure - TEST") so it can be saved as a PDF. The agent fees appear in CD section H and the ALTA "Commission" section.
- The overview's old "Earnest & commissions" box is now "Earnest money" (EMD held by only) for everyone; commissions show only in the Agent fees box (AF-7).
- AF-7 (follow-ups, Nov 13; John assigned them to Claude): **one place for commissions.** Place Order now has, for each agent side, Commission % and $ (typing one fills the other from the purchase price) and an admin fee; they are saved as the file's Agent fees once the agents are added. Edit order details, Accounting > Contract figures and the TC's contract figures no longer take a commission: they point to the Agent fees box, and Accounting shows both sides read only. The database file moves any commission still on an order into Agent fees (in the change history), empties the order's old commission fields so buyers and sellers can't read them, and refuses a commission written to the order again with a plain message. The agent's "Confirm Your Transaction Information" task no longer asks for a commission or fees; it points to the Agent fees box. Answers agents already sent are still shown.
- AF-7 walkthrough: `tests/e2e-roles/specs/agent-fees.spec.js` (Processor enters, listing agent sees only their side and confirms, a staff change needs a reason, the buyer never sees agent fees, the task points to the box) and Place Order agent fees in `order-entry.spec.js`.
- AF-7 follow-up (Nov 14, [PR 259](https://github.com/Johncoester/cla-portal-demo/pull/259)): after the one-place database file was applied on TEST, every save of an order failed with a permission error, including a normal Place Order. The follow-up database file lets a signed-in user save an order again. Writing an old commission is still refused with the plain Agent fees message. Not Live until that file is applied on TEST and Place Order is checked there.
- AF-8 (John, Nov 14; assigned to Claude): the old agent task **Commission information** saved the agent's commission only on the task, so Accounting > Contract figures, the CD and the ALTA statement showed "Not entered yet" (MD-26-97260 $28,500, VA-26-97304 $20,000). The database file moves each saved commission into that side's Agent fees where the side has none (% worked out from the sales price, Paid by kept, source agent; a submitted task counts as the agent confirming it, an unfinished draft does not), logs every move or anything it couldn't move in the change history, and posts it to Accounting. A new version of the task asks for Brokerage, License ID and Notes only, with a note pointing to the Agent fees box; open copies move to it and keep their answers. A guard refuses a commission sent to the task from an old page, with a plain message.
- Agents' earlier "Confirm Your Transaction Information" submissions are kept (every version), and the file's processor gets an in-portal notice when they submit or revise it.
- The Accounting fee ledger already has a "Commission" section that shows on the CD (section H, "Other") and on the settlement statement.
- The portal has an in-portal notifications list, and Accounting fee changes are already logged.

**What's still missing**

- Notice emails are queued in the portal's outbox but never sent on TEST (the TEST portal sends no email). Sending them needs the production mail switch, which is John's call.
- A sales price change re-posts the commission in the database (TEST); the demo (mock) portal re-posts only when the fees are saved.
- "Generate CD" and "Generate ALTA" make the PDF with the browser's own "Save as PDF". The portal doesn't store the PDF on the file.
- Other fees are added in the Agent fees box, not on Place Order (Place Order has commission and admin fee only).

**Links**

- Spec: [docs/specs/agent-fees-flow.md](docs/specs/agent-fees-flow.md)
- Related pull requests: [PR 23](https://github.com/Johncoester/cla-portal-demo/pull/23) (agent tasks), [PR 53](https://github.com/Johncoester/cla-portal-demo/pull/53) (agent task submit on TEST), [PR 100](https://github.com/Johncoester/cla-portal-demo/pull/100) (agent commission form fields), [PR 134](https://github.com/Johncoester/cla-portal-demo/pull/134) (Place Order earnest and commissions), [PR 187](https://github.com/Johncoester/cla-portal-demo/pull/187) (earnest and commissions kept in sync with Accounting)

**Decisions**

- Agent-confirmed fees win. Staff changes need a reason and notify the agent.
- Agents never write fee tables directly, only through a server function checked against their own side.
- Commission can be entered as % or $, and the two always stay in sync using the sales price.
- Each agent side has a commission, an admin fee (default payer: buyer for the buyer's agent, seller for the listing agent, changeable per file) and up to 5 other fees (description, amount, paid to). All of them post to Accounting automatically.
- A staff change to an agent-confirmed fee only notifies the agent. There's no re-approval.
- When an agent changes a fee, the processor, pre-processor and TC on the file are told, in the portal and by email.
- Buyers and sellers never see commissions or agent fees.
- Keep the live CD and Settlement Statement tabs, and add "Generate CD" and "Generate ALTA" PDF buttons.
- A TC can confirm fees for the agent. It's logged as confirmed by the TC, and the agent is notified.
- John answered all seven open questions on Nov 12 at 2:33 PM ET. See the spec.
- Queue: John started the build on Nov 12 at 8 PM ET (t1566u, "Start a second builder tonight"), alongside the bug fixes. Merges stay one at a time.
- Follow-ups (John, Nov 13): one place for commissions (the older commission boxes point to Agent fees instead of keeping a second copy), remove the fee questions from the agent's task, add a walkthrough test, AF-1 choices approved as written. Assigned to Claude; John waived rule 9 for this build (the walkthrough on main was failing for unrelated buyer/seller tests).
- AF-1 choices (approved as written by John, Nov 13): a commission can't be saved until the file has a sales price, so % and $ can always be checked against it. The commission and other fees also record who pays them, with the same defaults as the admin fee (buyer for the buyer's agent, seller for the listing agent). When staff change a confirmed fee, the record of who confirmed it stays, so every later staff change still needs a reason. A fixed-$ commission bigger than a new, lower sales price switches to keeping its %. A TC can confirm the side of an agent on their team; the file's own TC can confirm either side. A refinance has no agent fees.
- Nov 14: the list of old commission keys stays the same. A signed-in user can save an order that does not write those keys. Writing an old commission still shows the plain Agent fees message, not a permission error. AF-7 stays not Live until that permission fix is applied on TEST and Place Order is checked there.
- FF-101c (Nov 18): move the existing Agent fees block under the agent task sections; do not change the commission fields in this item (FF-101b adds broker fee / total / payout).

---

## Commission under agent task sections (FF-101c)

**How it should work.** On Tasks, the listing agent's commission and fees sit under the Listing Agent task section, and the buyer's agent commission and fees sit under the Buyer's Agent task section. File Overview no longer shows the Agent fees box. Staff, agents and TCs who already saw Agent fees still see the same fields in the new place. Accounting still shows commissions read only. Buyers and sellers never see them. Broker fee, total and payout methods are a separate item (FF-101b).

**Status: In progress.** Tracker row FF-101c. Francis Santos, Nov 18 2026 11 AM meeting notes; confirmed by John Coester Nov 18 2026 2:13 PM ET. Pull request: [PR 351](https://github.com/Johncoester/cla-portal-demo/pull/351). Not Live until checked on TEST and migration `20261125260000_ff101c_agent_fees_tasks_location.sql` is applied on TEST (message wording only).

**What's built**

- Agent fees removed from File Overview (staff and TC).
- Each side's reusable Agent fees card sits under that side's task section on Tasks (`buyer-agent` / `listing-agent`).
- Edit order details, Accounting pointers and the commission task note point to Tasks.
- Accounting > Contract figures / Basic Info still shows the read-only commissions summary.
- Walkthrough and unit tests look for Agent fees under the task sections.
- Cache stamp `202611246500`.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- Database file for refusal / note wording not applied on TEST yet.
- FF-101b (broker fee, total, payout methods) is separate.

**Links**

- Spec: [docs/specs/agent-fees-flow.md](docs/specs/agent-fees-flow.md)
- Source: Francis, Portal review Nov 18 2026 11 AM (Gmail 1a1ef9d3d862da08); John confirmed Nov 18 2:13 PM ET via Francis Feedback.

**Decisions**

- Move the existing block only; do not edit commission fields in this PR (avoid conflict with FF-101b).
- Keep `data-agent-fees` / `data-agent-fee-side` so Accounting and the walkthrough keep working.

---

## CD / ALTA generation

**How it should work.** The Closing Disclosure (CD) and the ALTA settlement statement are built from the file's Accounting fee ledger, so every fee is entered once and lands in the right section of both documents.

**Status: Built (Live on TEST through AF-5 and AF-6).**

**What's built**

- A file's Accounting tab has two live views, **Closing Disclosure** (pages 1-5) and **Settlement Statement**. Both are built from the fee ledger whenever they're opened, and both can be printed.
- Every ledger line has a CD section and an ALTA section. A commission line goes to CD section H ("Other") and to the ALTA "Commission" section.
- CD page 5 lists the buyer's and seller's real estate brokers from the file's agents.
- AF-5: every agent fee (commission, admin fee, other fees, per side) posts to the ledger by itself, so it lands in CD section H and the ALTA "Commission" section with no re-entry.
- AF-6: **Generate CD** and **Generate ALTA** buttons on those tabs open the print window with the file's document name filled in, to save as a PDF.
- The Accounting and payoffs database files, plus the feature-switch table (`private.features`), are a verbatim record of what is already on TEST. They do not load on a fresh database by themselves. TEST's base permission helpers (`private.me_role`, `private.can_access_deal`, and the others they call) and the deal columns those helpers use are not in the repo. A full TEST schema export is the next separate item. John Coester asked for the copy on Nov 15 2026, 9:56 AM ET, and for this label on Nov 15 2026, 1:22 PM ET. Nothing is applied again, and this copy is not marked Live.

**What's still missing**

- The generated PDF is saved by the browser ("Save as PDF"); the portal doesn't store it on the file.

**Links**

- Spec: none yet. The agent fees parts are in [docs/specs/agent-fees-flow.md](docs/specs/agent-fees-flow.md) (requirement 5).
- Related pull requests: [PR 237](https://github.com/Johncoester/cla-portal-demo/pull/237) (AF-5, agent fees post to the ledger), [PR 238](https://github.com/Johncoester/cla-portal-demo/pull/238) (AF-6, Generate CD / ALTA). The CD and Settlement Statement views were built before the repo's current pull request history. The TEST database files copied into the repo, including the feature-switch table, are in [PR 288](https://github.com/Johncoester/cla-portal-demo/pull/288).

**Decisions**

- One fee ledger feeds both the CD and the settlement statement. Nothing is entered twice.
- Keep the live Closing Disclosure and Settlement Statement tabs (view and print), and add "Generate CD" and "Generate ALTA" buttons that create a PDF (John, Nov 12).

---

## Accounting sidebar (FF-061)

**How it should work.** On a file, the Closing menu stays as it is. Accounting is its own section below that menu. It lists Ledger, Receipts, Disbursements, Account Balances, Balancing, and Loan Funding, in that order. The same six links sit in the accounting page's own section list, directly under Closing. Someone who cannot see Accounting today still does not see the section. Loan Funding opens the existing Funding page, and only for someone who could already open Funding.

**Status: In progress.** Not on TEST yet. Pull request: [PR 323](https://github.com/Johncoester/cla-portal-demo/pull/323).

**What's built**

- The file sidebar keeps Scheduling Details and the buyer's Closing appointment. Accounting is a separate section under the file links, for the same people who could open Accounting before.
- Ledger is the existing fee ledger. Receipts, Disbursements, Account Balances, and Balancing are pages on the same Accounting address, filled from that test ledger. They are not a bank balance, a deposit, a printed check, or a wire.
- Loan Funding is the existing Funding page. It stays a separate Funding link for someone who can open Funding but cannot see Accounting.
- The Closing charges list (sections A through N) is unchanged. Fee ledger is no longer under CLA tools. It is Ledger under Accounting.

**What's missing**

- Not checked on TEST yet. No database change.

**Links**

- Spec: [docs/specs/accounting-sidebar.md](docs/specs/accounting-sidebar.md).
- Source: Francis Santos, Nov 12 2026, 1:53 PM ET (Gmail 1a1d11bd4bd135f8), confirmed Nov 17 2026, 1:55 PM ET (Gmail 1a1eaddb3dcfc5d6), tracker FF-061.

**Decisions**

- Routes stay `#/deals/:id/accounting` and `#/deals/:id/funding`. The new pages are `?v=receipts`, `?v=disbursements`, `?v=balances`, and `?v=balancing` on the accounting page that already exists.
- The figures are the test ledger the file already has. Nothing is read from a bank, and nothing is written to TEST or production.
- FF-103 moves this menu. Ledger, Receipts, Disbursements, Account Balances, and Balancing stay as tabs on the Accounting page. They are no longer separate rows in the file sidebar.

---

## File sidebar (FF-103)

**How it should work.** Inside a file, a Processor or Super admin sees the left sidebar in this order: File Overview, Tasks, My Tasks, Inbox, Email, Documents, then ORDER (General and Title), then CLOSING (Charges), then one Accounting item, then PREVIEW (Closing Disclosure and Settlement Statement). General, Title, and Charges fold with a chevron. The second menu column inside the file is gone. Each page that column opened is still a direct sidebar link, except Ledger, Receipts, Disbursements, Account Balances, and Balancing, which stay as tabs on the Accounting page. The Accounting page itself, including the balance summary, is unchanged. A person who could not open a page still does not see it. A buyer or seller keeps the shorter menu.

**Status: In progress.** Not on TEST yet. Tracker item FF-103. Not Live.

**What's built**

- The file sidebar for someone who can already open Accounting follows the order Francis confirmed.
- General opens the existing Basic Info, Contacts, Loan check, Earnest & Commissions (the earnest block already on Basic Info), Taxes & Prorations, Payoffs, and Other Contacts.
- Title opens the existing CPL, Policy Info & Rates, Commitment (Schedule A), and Final Policy pages.
- Charges opens the existing charge sections A, B, C, E, F, G, H, J, K/M, and L/N.
- Accounting is one sidebar item. It opens the ledger. Ledger, Receipts, Disbursements, Account Balances, Balancing, and Loan Funding (when that person could already open Funding) are tabs on that page.
- Closing Disclosure, Settlement Statement, Prorations, CD details & escrow, Payment summary, and Edit history are sidebar links.
- Scheduling Details, Agreements, Activity, Post-Closing, E-Recording, and Wires stay reachable.
- Someone who cannot see Accounting keeps the previous shorter file menu, including Funding when they could already open it.

**What's missing**

- Not checked on TEST yet. No database file.
- There is no Properties page today, so the menu does not add one. The address and parcel stay on File Overview.

**Links**

- Spec: [docs/specs/file-sidebar.md](docs/specs/file-sidebar.md).
- Related: [Accounting sidebar (FF-061)](#accounting-sidebar-ff-061).

**Decisions**

- No new pages and no database change. Each label opens a page the portal already has.
- Loan opens the existing Title loan check. Commitment opens the existing Schedule A page. Earnest & Commissions opens Basic Info, where earnest money and the commission summary already sit.
- Other Contacts stays under General because that page already existed in the second column.
- The shell cache stamp is 202611247600.

---

## Title production numbers flow (Qualia scenario, QFLOW-1)

**How it should work.** A processor opens a file and enters the contract, the loan, the deposit, the agent fees, the payoffs, the fees and the tax proration once. Every figure then lands where Qualia puts it: the fee ledger, the Closing Disclosure summaries (K, L, M, N), cash to close, the ALTA statement and the balance check. One fixed purchase, entered by Claude on Qualia's own test file on Nov 15 2026, is the standard: price $100,000, loan $50,000, deposit $5,000, 1% listing commission, payoff $40,000, buyer fees $2,375, seller fees $700, county tax $3,650 a year with a July 1 settlement. Qualia's answers: cash to close $45,550.00, paid out to others $44,075.00, balanced. Outside connections (CPL, final policy, e-recording, bank accounts) are not part of this.

**Status: In progress.** QFLOW-1. John Coester, Nov 15 2026 (voice, then "test portal is ready" at 12:51 PM ET), assigned to Claude. Pull request: [PR 289](https://github.com/Johncoester/cla-portal-demo/pull/289). No database file. Not Live until this is merged and the steps below are checked on TEST.

**What's built**

- The same purchase was entered on TEST as file MD-26-97379 (Nov 15 2026). Price, loan, deposit, the 1% commission from Place Order, the payoff and the fees all reached the fee ledger, the CD summaries, the payment summary and the balance check with the same figures as Qualia.
- Fix: on TEST, Taxes & Prorations said "Set the settlement (closing) date on the order first" on a file that had one, so no proration could be added. The hosted Accounting read left the settlement date out. It now sends it, the same as the demo portal.
- Fix: on TEST, the ALTA statement and the Closing Disclosure showed a dash for the buyer, the seller and the real estate brokers. Staff open Accounting from the light file header, which has no people. The two statements now read the people on the file, typed people included. The CD names each brokerage with its agent as the contact.
- Excess deposit ([PR 290](https://github.com/Johncoester/cla-portal-demo/pull/290), Nov 15 2026, built by Claude, not merged yet). When someone other than CLA holds the deposit and has already paid it to the seller, the processor types that amount under Accounting, Contract figures, Earnest money, in "Deposit already paid to the seller". It shows as Excess Deposit on CD line N.01, on the ALTA and on the fee ledger, comes off the seller's proceeds, and is not counted as money CLA receives. The buyer still gets credit for the whole deposit. On the Qualia file this makes seller proceeds $51,475.00, the same as Qualia. It is saved with "EMD held by" on the order, so no database file is needed. It cannot be more than the deposit.
- A test (`test/test-qualia-scenario.js`) enters the purchase the way a processor does and checks every figure against Qualia's. It runs with the other tests on every pull request.

**What's still missing**

- The Title tab's Schedule A, Requirements and Policy info start blank. Qualia fills the proposed insured, the commitment number, the policy amounts and the standard requirements from the file.
- The printed CD numbers its summary lines in order (K.02, N.01, N.02). The Charges pages and the real form keep fixed numbers (K.03, N.02, N.04).
- The payoff line reads "Payoff of First Mortgage Loan". Qualia adds the lender's name.
- Taxes & Prorations starts on a 365-day year with the settlement day charged to the seller. This file matched Qualia's $1,825.00 on a 360-day year with the settlement day charged to the buyer. Which one CLA uses is John's or Caroline's call.
- The Funding page's "balanced" check on TEST adds up the typed fees only. It does not yet read the sale price, deposit, loan or excess deposit from the order the way the Accounting pages do.
- On the Charges pages the cursor leaves the table after each cell is saved, and every Accounting page is headed "Contract figures".

**Links**

- Notes on how Qualia moves each figure: project file `claude/qualia-walkthrough-notes.md`.
- Related pull requests: [PR 237](https://github.com/Johncoester/cla-portal-demo/pull/237) (agent fees post to Accounting), QF-1 (cash to close from the order).

**Decisions**

- John, Nov 15 2026: checklists come later. First make the numbers flow through every module so a file can reach a finished CD, ALTA and balanced ledger. Claude builds this; Grok stays on the Connect feedback.
- The Qualia figures above are the standard. A change that moves any of them has to say why.

---

## Prorations on the Closing Disclosure (FF-098)

**How it should work.** A processor enters property taxes, ground rent, HOA dues, or another proration once, on Taxes & Prorations. When the calculation is finished, that amount is on the fee ledger, the settlement statement, and the Closing Disclosure. An item the seller already paid is a charge to the buyer and a credit to the seller, under Adjustments for Items Paid by Seller in Advance (K and M). An unpaid item is a credit to the buyer and a charge to the seller (L and N). City/town taxes, county taxes, and assessments use those named lines. Ground rent, HOA, and anything else use the next line in the same section. The line shows the dates the adjustment covers. Tax prorations use a 365-day year, and the buyer pays for the settlement day, unless someone changes that on the file. HOA and ground rent follow the same rule.

**Status: In progress.** FF-098. Francis Santos, Nov 17 2026, 2:49 PM ET (Gmail msg 1a1eb0eb7ee40f0c, subject "Proration Amount"), as Processor 2 on TEST. Pull request: [PR 330](https://github.com/Johncoester/cla-portal-demo/pull/330). Not Live. No database file.

**What's built**

- A finished proration is saved to the ledger as soon as the amount can be calculated, and again when it is changed. It is logged.
- Paid-in-advance items show on K and M. Unpaid items show on L and N. The Charges screens and Closing Disclosure page 3 use the same lines.
- County or property tax uses the County Taxes line. City/town tax uses the City/Town Taxes line. Assessments use the Assessments line. Ground rent and HOA use the next open line in that section, with the date range on the line.
- The worked example (July 1, 2026, a $3,650.00 bill, 365-day year, buyer pays the settlement day) is $1,840.00 when the seller already paid it and $1,810.00 when it is unpaid. Ground rent of $365.00 a year is $184.00. HOA of $100.00 a month on July 15 is $55.89. Charging the settlement day to the seller on that tax bill changes $1,840.00 to $1,830.00 and the file keeps that choice.
- A property-tax escrow deposit (Closing Disclosure section G) stays in closing costs. It is not also posted as a proration.

**What's still missing**

- Not checked on TEST yet. Not Live.

**Links**

- Spec: [docs/specs/proration-cd.md](docs/specs/proration-cd.md)
- Source: Francis Santos, Nov 17 2026, 2:49 PM ET, Gmail msg 1a1eb0eb7ee40f0c. Uses the PRORATE-1 defaults (tracker row 322).

**Decisions**

- The $3,568 property-tax line Francis saved on MD-26-97407 is the escrow deposit in section G. It belongs in closing costs (K.03), not on the proration lines. The proration is a separate entry.
- No database change. The proration is already stored on the fee ledger.

---

## Buyer and seller invites and sign-in

**How it should work.** Staff invite a buyer or seller from a file. The person opens the invite email, sets a password once and lands in the portal. If they forget the password, Forgot password emails them a reset link that opens the TEST portal.

**Status: Partial.**

**What's built**

- Buyer, seller and agent invites from a file's Contacts tab, with an automatic invite email ([PR 95](https://github.com/Johncoester/cla-portal-demo/pull/95), [PR 140](https://github.com/Johncoester/cla-portal-demo/pull/140)).
- FF-073a (Janine's buyer recordings, Nov 12): accepting an invite twice (double-click or a second tab) can no longer delete the login. Only a login made in that same request that never became a portal user is cleaned up.
- FF-073b: the Forgot password email's link opens the portal the person is using (testportal.clatitle.com on TEST), not the old GitHub address.
- FF-073c / MF-055 point 4 (John, Nov 14 2026, t1667u): a still-open invite opens the registration form. An invite that was already used, or an email that already has a portal login, goes straight to Sign in (`#/login`) with that email filled in. There is no "already used" page and no error. If that browser is already signed in, the person lands on their home instead (Open Orders for a buyer or seller, the dashboard for staff and agents) because the sign-in page already sends a signed-in person home. A bad, expired or revoked link still explains what is wrong. ([PR 264](https://github.com/Johncoester/cla-portal-demo/pull/264))
- FF-073d / MF-055 point 3: the invite email names the property address (subject and a welcome line with the person's name and role) so the buyer can tell which file it is for. Invites still come from testportal@clatitle.com.
- FF-073e / MF-055 point 2: changing a buyer, seller or agent email on a file automatically sends a new invite to the new address, matching their role, from testportal@clatitle.com (John, 1:30 PM ET Nov 13).
- FF-055 / MF-048 (Francis, Nov 11; John, Nov 13): Share Files to someone on the file who has no portal login yet. For CLA staff the To list marks that person "no portal login yet; will be invited". On Send the portal emails them the usual invite and holds the message and the files; the conversation shows them as "invited, not signed in yet". When they set up their login, the conversation is waiting for them, unread. Before this, Share Files to that person always failed with "Pick at least one recipient on this order". Needs the database change 20261119030000_share_invited_hold on TEST; until it is applied, picking that person gives a plain message instead. Not Live until then. ([PR 251](https://github.com/Johncoester/cla-portal-demo/pull/251))

**What's still missing**

- The TEST Auth "Redirect URLs" list must include https://testportal.clatitle.com/ for the reset link to land there; if it doesn't, Auth falls back to its Site URL. John checks that setting.
- The TEST Auth "Invite user" template must be updated once to the version in supabase/templates/ (subject and body) so the received email shows the property address already being sent with each invite. Until that paste, the portal still sends the address in Auth metadata, but the current Nov 9 template does not print it.
- MF-055 points 1 and 5 (password reset email, saved password / invalid login) are covered by FF-073b and the LOGIN-1 / LOGIN-2 items, not this change.
- The database file for the automatic email-change invite is in this pull request and has a rollback. It is not applied on TEST until after merge (rule 4).

**Links**

- Spec: none yet.
- Related pull requests: [PR 95](https://github.com/Johncoester/cla-portal-demo/pull/95), [PR 140](https://github.com/Johncoester/cla-portal-demo/pull/140), [PR 219](https://github.com/Johncoester/cla-portal-demo/pull/219) (FF-073a), [PR 220](https://github.com/Johncoester/cla-portal-demo/pull/220) (FF-073b), [PR 251](https://github.com/Johncoester/cla-portal-demo/pull/251) (FF-055 / MF-048), [PR 254](https://github.com/Johncoester/cla-portal-demo/pull/254) (FF-073c/d/e and MF-055 points 2-4), [PR 264](https://github.com/Johncoester/cla-portal-demo/pull/264) (used invite goes straight to Sign in).

**Decisions**

- accept-invite never deletes an existing or just-claimed login (John, Nov 12, 6:09 PM ET).
- The reset link uses the current portal address; the Auth redirect list is John's setting, not changed by a pull request.
- Janine confirmed FF-073c/d/e on Nov 13 at 10:43 AM ET (YES to John's 9:08 AM list). John decided at 1:30 PM ET Nov 13 that a new invite is sent automatically when a buyer, seller or agent email changes (not a Resend button).
- John, Nov 14 2026 (t1667u): opening a used invite goes straight to Sign in. The Nov 13 "already used" message page is retired. The sign-in page still fills in the invited email. A person who is already signed in is sent to their home by the existing sign-in rule, without checking that the signed-in email matches the invite. Invalid, expired and revoked links still stay on the explanation page.
- TEST-FIX-1 (John, Nov 17 2026): the demo pending invite and the demo expired invite are dated from today, 7 days ahead and 1 day ago. A fixed calendar date was going stale, and the test then treated a still-pending invite as expired. What the test checks did not change.
- Sharing with someone who has no portal login invites them and holds the files until they sign in (John, Nov 13, by voice: option B). Only a buyer, seller, buyer agent or listing agent on the file can be invited this way. Wire instructions are never held. Someone who already has a pending invite is not emailed a second link.

---

## Demo invite dates stay ahead of today (TEST-FIX-1)

**How it should work.** The sample pending invite stays pending, and the sample expired invite stays expired, on any day the tests run. A calendar date printed in the fixture must not decide that.

**Status: In review.** Tracker item TEST-FIX-1. John Coester, Nov 17 2026. Pull request: [PR 318](https://github.com/Johncoester/cla-portal-demo/pull/318). Not Live. No database file. Nothing on testportal.clatitle.com changes, because TEST reads invites from the database, not from this sample list.

**What's built**

- Lena's sample invite (the pending one the sign-in test opens) expires 7 days from the moment the sample data is built.
- Evan's sample invite (the expired one) expired 1 day before that moment. The page still says the link expired and still offers sign in.
- Eli's sample HR invite stays pending the same way, and Ezra's sample HR invite stays expired the same way. Eli's old date was 17 November 2026 at 13:00 UTC, which had already passed.
- Two email samples that carried an expiry inside the next 30 days (23 November 2026 and 20 November 2026) now use 7 days from today. Those samples are only text. The checks on the subject, the welcome line, and "not sent" are unchanged.

**What's still missing**

- Not merged. Not applied anywhere, and there is nothing to apply: no database file.
- A browser that already saved the old demo list keeps that old list until its saved demo data is cleared. A fresh visit builds the new dates.

**Links**

- Spec: [docs/specs/test-fix-1.md](docs/specs/test-fix-1.md)
- Pull request: [PR 318](https://github.com/Johncoester/cla-portal-demo/pull/318)
- Source: John Coester, Nov 17 2026. Tracker item TEST-FIX-1. No video.

**Decisions**

- The date went stale. The behavior under test is unchanged: a pending invite still opens the setup form, and an expired invite still explains itself. Rule 5.
- Accepted sample invites keep their old dates. Those rows are already accepted, so the expiry date does not change what the person sees.
- Closing dates, task due dates, and the sample payoff good-through date (27 November 2026) stay as written. They are not an invite expiry, and the payoff's interest amount was figured for that fixed period.
- No SQL was applied. No secrets. The shell cache stamp stays 202611242010. The two sample-data files moved to 202611242100 so a cached copy of the old list is not reused.

---

## File page fixes from Janine's Nov 12 video

**How it should work.** On a file, the bell, Messages, Closing appointment, tasks, Documents and Activity behave the way Janine and Francis described in the Nov 12 "Processor and Seller Screens" video and Francis's confirm-back (Nov 12, 6:14 PM ET).

**Status: Partial.**

**What's built**

- FF-071b (#22): the Activity tab's filters (type, person, date, words) work, and each row shows who did it.
- FF-064/065 (#5, first part): clicking a bell notification closes the menu and opens the item, for sellers and processors.
- FF-070 (#18 to #20): the Messages badge clears when a conversation is opened, messages show the sender's name and role (not "Participant"), and the reply box is large and grows as you type. Names and roles load in about 4 ms even on a file with 200 conversations (was about 230 ms).
- FF-063 (closing appointment): when the processor confirms one proposed time, the other proposed times on that file are marked declined, so no one sees leftover proposals.
- FF-069d (#16, #17): a finished task opens read-only for buyers, sellers and agents (no Save or Complete buttons), and its status reads "Done".
- Walkthrough fix for FF-069d (Nov 13): every walkthrough run starts by putting the test buyer's and test seller's finished tasks on the test file MD-26-99001 back to To do (and again right before each buyer task test), because a Done task is now read-only. A scheduled run that skips the tests now shows as cancelled, not as a pass. No change to what the team sees. Decided but not built (waiting for Francis to confirm, rule 1): buyers and sellers get an Edit button on a finished task.
- FF-063c (#3): when the processor sets the closing at a mobile notary, they enter the notary's street, city, state and ZIP, and the closing shows "Mobile notary at <address>".
- FF-066 (#6): the seller proceeds acknowledgment (with the $5,000 wire note and a required checkbox) is on How you want your proceeds, not Personal information. Forms already started keep their answers.
- FF-067 (#7): the seller's Outstanding Mortgage Information takes the full loan number (up to 30 letters, digits or dashes); several mortgages save without being cut off.
- FF-068 (#8, #9, #11, #12): EIN/Tax ID for entities; the Social Security number is visible while typed with automatic dashes and masked after save (person and spouse); sellers read "Is the property your primary residence?"; "Where is the water meter?" is removed. Forms already started keep their answers.
- FF-069b (#14): mortgage and spouse phone numbers must be exactly 10 digits (shown as xxx-xxx-xxxx) before the form saves.
- FF-071a (#21): the Documents table uses the full page width (long names wrap) and opens newest first.
- Documents fix (Nov 13): a file with more than 1,000 documents now always shows its newest ones, including one just uploaded. Before this, the list could leave them out. Found by the walkthrough, whose test file has about 1,300 test uploads.
- Walkthrough cleanup (Nov 13): after each run, the test conversations and test orders the walkthrough created are actually deleted again. Until now they piled up on TEST (451 conversations and 95 orders) because the cleanup deleted them in the wrong order (and, after that fix, because two of its deletes asked the database for a column those tables don't have). No change to what the team sees.
- Walkthrough recordings (Nov 13): when a walkthrough test fails, the step-by-step recording it saves no longer contains the test accounts' email addresses or passwords. Recording stops while a test signs in, so neither the typed values nor the sign-in request is in it. No change to what the team sees.
- Walkthrough email test (Nov 13): the test no longer has its own list of inboxes it may email. It now sends its file email to every address on the test file MD-26-99001 (plus the test inbox it reads), so it no longer stops when the team adds a real address to that file. The portal's own Live Test email check is unchanged. No change to what the team sees.
- Walkthrough Fill In check (Nov 13): the buyer Fill In test no longer uses the Lender information form for its Save progress check. That form, already filled in on the test file, finishes the task when saved (on purpose), so the test failed whenever it came first in the list. No change to what the team sees.
- TEST email to any address (Nov 13, John): the portal no longer refuses to email addresses outside a short test list. File emails, "Email sellers and agents" and portal invites now go to whatever address is on the file, because the team enters real information on TEST on purpose. The "CLA Portal Live Test only sends to test addresses" notes and the "not a test address" warning are gone. Live once the gmail-send function is deployed to TEST.
- FF-071c (#23): the file overview shows the Disbursement date: for a refinance, the 4th business day after closing (rescission rule: Saturdays count, Sundays and federal holidays don't); for a purchase, the closing date. The processor can type a different date in Edit order details; clearing it goes back to the automatic date.
- MF-045 (Matt, Nov 11, Documents notes): on a file's Documents tab the From column shows the name and role of whoever shared each document (for example "Pat Agent, Buyer's agent" or "Proc One, Processor"). On TEST it was blank. The search box and the From sort now work on it. A buyer or seller sees "CLA Title & Escrow" for documents another party uploaded. No database change ([PR 256](https://github.com/Johncoester/cla-portal-demo/pull/256)).
- FF-052 / MF-050 (Francis, Nov 11): Place Order, step 4 (Lender & Loan), has a Disbursement date with a calendar picker next to Closing date. Leave it blank for the automatic date. Edit order details already had the same field (FF-071c). No database change ([PR 255](https://github.com/Johncoester/cla-portal-demo/pull/255)).
- FF-072 / FF-054b (#24): in a file's email (To, Cc, Bcc), "Start a conversation" and Share files, the people offered are only that file's parties and the CLA staff on it; the browser's saved-address suggestions are off for those boxes. Any address can still be typed.
- FF-011b (street address lookup): on task forms with an address (for example the forwarding address or a mailed proceeds check), typing a full street line such as "12 Main St, Rockville, MD 20850" fills the empty City, State and ZIP boxes.

**What's still missing**

- On hold: #1, #2, #4, #5, #10, #13, #15, #16, spouse marital status, entity documents required, phone and email icons with no app.
- Citizenship is no longer on hold. Janine asked on Nov 17 2026 to type it on one line. See Citizenship on one line (JN-CITIZEN-1).

**Links**

- Spec: none yet. Source: Janine's video Nov 12 2:57 PM ET; Francis Feedback tickets FF-063 to FF-072.
- Related pull requests: [PR 221](https://github.com/Johncoester/cla-portal-demo/pull/221) (FF-071b), [PR 222](https://github.com/Johncoester/cla-portal-demo/pull/222) (FF-064/065), [PR 223](https://github.com/Johncoester/cla-portal-demo/pull/223) (FF-070), [PR 224](https://github.com/Johncoester/cla-portal-demo/pull/224) (FF-063), [PR 226](https://github.com/Johncoester/cla-portal-demo/pull/226) (FF-070b speed fix), [PR 228](https://github.com/Johncoester/cla-portal-demo/pull/228) (FF-069d), [PR 229](https://github.com/Johncoester/cla-portal-demo/pull/229) (FF-063c), [PR 230](https://github.com/Johncoester/cla-portal-demo/pull/230) (FF-066), [PR 231](https://github.com/Johncoester/cla-portal-demo/pull/231) (FF-067), [PR 232](https://github.com/Johncoester/cla-portal-demo/pull/232) (FF-068), [PR 233](https://github.com/Johncoester/cla-portal-demo/pull/233) (FF-069b), [PR 234](https://github.com/Johncoester/cla-portal-demo/pull/234) (FF-071a), [PR 239](https://github.com/Johncoester/cla-portal-demo/pull/239) (FF-071c), [PR 240](https://github.com/Johncoester/cla-portal-demo/pull/240) (FF-072/FF-054b), [PR 241](https://github.com/Johncoester/cla-portal-demo/pull/241) (FF-011b), walkthrough fix for FF-069d ([PR 242](https://github.com/Johncoester/cla-portal-demo/pull/242)), Documents newest-first fix ([PR 244](https://github.com/Johncoester/cla-portal-demo/pull/244)), walkthrough cleanup order ([PR 245](https://github.com/Johncoester/cla-portal-demo/pull/245)), walkthrough recordings without passwords ([PR 246](https://github.com/Johncoester/cla-portal-demo/pull/246)), walkthrough email test without its own inbox list ([PR 247](https://github.com/Johncoester/cla-portal-demo/pull/247)), sign-in request kept out of walkthrough recordings ([PR 248](https://github.com/Johncoester/cla-portal-demo/pull/248)), walkthrough cleanup column fix ([PR 249](https://github.com/Johncoester/cla-portal-demo/pull/249)), walkthrough Fill In check ([PR 250](https://github.com/Johncoester/cla-portal-demo/pull/250)), TEST email to any address (this change).

**Decisions**

- John approved fixing the bugs without waiting (Nov 12, 6:08 PM ET); Francis confirmed the rest on Nov 12, 6:14 PM ET.

---

## Citizenship on one line (JN-CITIZEN-1)

**How it should work.** On Personal information, for a buyer and for a seller, Citizenship is one line the person types. The same line is used for a spouse. An answer already saved, including "US Citizen" and "U.S. Citizen", still shows and can be saved again. A person can also type something that was not in the old list, such as "Born in Canada". Leaving it blank is allowed.

**Status: In progress.** The pull request is open. Not Live until `supabase/migrations/20261125180000_citizenship_free_text.sql` is applied on TEST. This pull request does not apply it.

**What's built**

- Buyer and seller Personal information, and the spouse section, ask for Citizenship on a single line. The old dropdown (U.S. Citizen, Permanent Resident, Non-Resident Alien, Other) is gone from the form definition.
- A saved answer stays on the same task and in the same spouse column. The column was already plain text. TEST has no check and no enum on it, so the column is not replaced.
- The database file changes the question on the existing Personal information templates from a dropdown back to a line, and drops a citizenship check only if one is present. The rollback puts the dropdown back and does not change the column.

**What's still missing**

- Not on TEST until the database file is applied. Until then, Personal information on TEST still shows the dropdown, because that question is stored with the template. The spouse line on TEST is already a text box.

**Links**

- Spec: [docs/specs/citizenship-free-text.md](docs/specs/citizenship-free-text.md)
- Source: Janine's email reply, Nov 17 2026, relayed via Francis Feedback. Tracker item JN-CITIZEN-1.
- Related pull request: [PR 334](https://github.com/Johncoester/cla-portal-demo/pull/334).

**Decisions**

- Keep `spouse_info.citizenship` and the answer stored on the task. Do not add a new column.
- The earlier dropdown file (`20261112060400_citizenship_and_agent_phone`) stays as history. The agent-card phone change in that file is not undone.

---

## Processor file overview cleanup (MF-054 / FF-074)

**How it should work.** On the processor File Overview, the only sections that stay are the light gray file box at the top (address, file number, settlement date), the Order Status milestone box, and Parties (with contact info), Notes, and everything below Notes. The buyer, seller and personal-detail boxes come off this screen. Closing date, time and how many days are left sit at the bottom of the Closing Date button in the left column, and the gray Closing Date box is gone from File Overview. The EMD box is gone too (that information is already in Order Status). This replaces MF-052 and MF-047.

**Status: Built (not Live yet).** The pull request is open. No database change. Mark Live after it is merged.

**What's built**

- Staff File Overview no longer shows the buyer/seller box, the EMD / Earnest & commissions box, or the gray Closing Date card.
- Order Status stays, with the disbursement date (FF-071c), open tasks, unread email, and Edit order details.
- Parties, Notes, Automation, Agent fees, and the sections under Notes stay. Source of business is shown with Parties.
- The left-column button shows the closing date, time and days remaining at the bottom. Client and agent overviews are unchanged. MF-056 renames that button to Scheduling Details; the date, time and days remaining stay.

**What's still missing**

- Nothing from the confirmed list. Signing method and closing location stay on the Closing Date tab (they were too long for the left-column button).

**Links**

- Spec: none yet. Source: Matt's Nov 12 Processor User-File Overview notes (Gmail 1a1d0725a93810ce) and his Nov 12 2:04 PM ET confirmation; FF-074 is the same request, re-forwarded Nov 13 8:52 AM ET. Tracker row 207 (MF-054); FF-074 is the duplicate row.
- Related pull requests: this change.

**Decisions**

- Matt confirmed the numbered list on Nov 12 at 2:04 PM ET. MF-054 supersedes MF-052 and MF-047. John waived rule 9 at 1:25 PM ET Nov 13 (t1618u) so this could be built while the walkthrough's remaining email failure was set aside. Agent fees stays on the overview because it is a separate live feature (AF-2), not one of the redundant boxes Matt asked to remove. On Nov 16, MF-056 renamed the Closing Date button to Scheduling Details. The date, time and days remaining stay on that button.

---

## Settlement office locations (FF-101d)

**How it should work.** When an agent or processor picks a CLA office for the settlement (Schedule the Settlement task, Scheduling Details, or the party scheduling link), the list is only the offices marked for settlements. That starts as Towson, Rockville and Bethesda. Rockville is the main office. Other offices stay in the offices table and on Admin > Offices, but are not offered for new settlement picks. A retired office never appears. A pending proposal that already uses another office still shows that office on the file.

**Status: In progress.** Tracker FF-101d. Francis Santos, Portal review Nov 18 2026 11 AM; John confirmed Nov 18 2026, 2:13 PM ET. Pull request: [PR 353](https://github.com/Johncoester/cla-portal-demo/pull/353). Database file `supabase/migrations/20261125300000_settlement_office_flag.sql` is not applied. Not Live.

**What's built**

- `public.offices.used_for_settlements` flag. Towson, Rockville and Bethesda are on; other offices stay off. Rows are not deleted.
- Settlement pickers and nearest-office default read only active offices with that flag. Existing file/proposal office names still show.
- Mock and hosted adapters follow the same rule. Cache stamp 202611246600.

**What's still missing**

- Not applied on TEST. Not checked on TEST yet.
- Admin UI to tick the flag is FF-102 (separate PR).

**Links**

- Spec: [docs/specs/settlement-office-locations.md](docs/specs/settlement-office-locations.md). Source: Francis's Nov 18 Gemini notes (Gmail 1a1ef9d3d862da08). Tracker FF-101d.
- Related: MF-010 (nearest office), MF-056 (Scheduling Details), FF-102 (Admin Offices flag UI).

**Decisions**

- Drive the picker from the offices table flag, not hard-coded names in the page (John, Nov 18).
- Notes' "Talson" / "Rockwell" mean Towson / Rockville.
- Do not apply the database file in this pull request.

---


## Admin Offices — Used for settlements (FF-102)

**How it should work.** On Admin > Offices, an Admin or Super admin can tick **Used for settlements** on an office. That is the only way staff turn the flag on or off after FF-101d seeds Towson, Rockville and Bethesda. The settlement pickers (Schedule the Settlement, Scheduling Details, party link) keep using FF-101d's filtered list; this change does not duplicate that picker.

**Status: In progress.** Tracker FF-102. John Coester via Francis Feedback, Nov 18 2026, 2:14 PM ET. Pull request: [PR 354](https://github.com/Johncoester/cla-portal-demo/pull/354). Rebased onto FF-101d (`cursor/ff-101d-settlement-offices-906a` / PR 353). Database file `supabase/migrations/20261125310000_office_used_for_settlements.sql` is not applied. Not Live.

**What's built**

- Admin > Offices checkbox and list chip for Used for settlements.
- `save_office` takes `p_used_for_settlements` (Admin / Super admin only). Direct insert/update/delete on `public.offices` revoked for portal roles; select stays.
- Reuses FF-101d picker code. No second column add or seed.
- Cache stamp 202611246700.

**What's still missing**

- Apply `20261125310000` on TEST after `20261125300000` (FF-101d).
- Not checked on TEST yet.

**Links**

- Spec: [docs/specs/admin-offices.md](docs/specs/admin-offices.md). Tracker FF-102.
- Related: FF-101d (settlement office flag + picker), MF-010 (nearest office).

**Decisions**

- Extend the existing Admin > Offices page; do not add a second offices screen (John / AGENTS.md).
- Column and seed stay in FF-101d; this PR only owns the Admin save path and write protection.
- Do not apply the database file in this pull request.

---

## Scheduling Details (MF-056 / FF-085)

**How it should work.** The file button that said Closing Date is **Scheduling Details**. The buyer's agent and the listing agent each have a task, "Schedule the Settlement for [property address]". They pick a settlement date (starting from the contract or addendum closing date), a CLA office (starting at the office nearest the property) or another address, a time from 9:00 AM to 6:00 PM, and notes. They can instead ask the buyer or the seller to schedule, which queues a link for that person and tells the agent. The seller can also choose remote online notarization on a computer. The choice shows on the Scheduling Details button. The processor sees the settlement agent name, a Settlement Agent Confirmed checkbox, and a separate notes button.

**Status: In review.** Tracker row 316 (MF-056). FF-085 is the same request. The database file is on TEST. Not marked Live here. The processor screen follow-up is MF-058.

**What's built**

- The file button says Scheduling Details. Staff and agents still see the closing date, time and days remaining, plus each side's date, time and place.
- Buyer's agent and listing agent tasks, with the ask-instead link, office list, other address, time, and notes. Seller side adds remote online notarization.
- A buyer or seller link (`#/schedule-party/...`) that does not need a sign-in. The link is queued in the outbox from testportal@clatitle.com. Nothing is emailed.
- Processor card: settlement agent name, Settlement Agent Confirmed, and Processor notes.
- Database file `supabase/migrations/20261124150000_scheduling_details.sql` and rollback. Applied on TEST.

**What's still missing**

- The older closing-date request (pick from a few time options) is still on the page under the new card.
- John's later change that locks the buyer's date to the file closing date. Not built.
- Not checked on TEST yet. Mark Live only after the database file is applied on TEST.

**Links**

- Spec: [docs/specs/scheduling-details.md](docs/specs/scheduling-details.md). Source: Matt Landsberg, email "Scheduling Feature", Nov 16 2026, 9:20 AM ET (Gmail 1a1e4bb28b3e5a7e). Tracker row 316 (MF-056). FF-085 is the duplicate on the same row.
- Related: MF-010 (nearest office), MF-011 (closer on the file), MF-054 (date on the button).

**Decisions**

- If the contract has no closing date, the settlement date is left blank and is required, unless the agent asks the buyer or seller to schedule.
- The settlement agent list is active staff whose role contains "Settlement Agent" or "Closer". No role matches that today, so the box is free text.
- This does not replace MF-011. The Closer field stays.
- Saving a side does not change the file closing date. The lock John asked for is held.

---

## Scheduling agent/notary (MF-058)

**How it should work.** On the processor Scheduling Details screen, each side has its own settlement agent/notary. The buyer side's details sit in a larger block under the buyer summary. The seller side's details sit inside the seller section. The label says settlement agent/notary. Phone and email are on each side, with Confirmed next to that person. Fields save on their own after the processor pauses, and the Save button for that person is gone. The signed-on date is not on this screen. Each side has a reminder that emails only the people on that side of the file, after the processor sees the list and chooses to send it.

**Status: In review.** Tracker row MF-058. Not applied to TEST. Not Live.

**What's built**

- Buyer settlement agent/notary in the larger lower part of the buyer section. Seller settlement agent/notary inside the seller section.
- Phone, email and Confirmed on each side. The words on the screen say settlement agent/notary. The database column names are unchanged.
- Autosave after a short pause, with Saved or a plain error. Typing is kept when a save fails.
- Signed-on date removed from this screen. A date already stored is left as it was.
- Send reminder on each side. Buyer side emails the buyers and the buyer's agent. Seller side emails the sellers and the listing agent. The processor sees the names and addresses from the file and must press Email these people. The message is queued in the outbox and sent through the same Gmail path as other portal email.
- Database file `supabase/migrations/20261124210000_scheduling_agent_notary.sql` and rollback. Not applied anywhere.

**What's still missing**

- Not checked on TEST until the new database file is applied. Do not mark Live before that.
- John's buyer closing-date lock is still held. This change does not write the file closing date.
- The Closing Disclosure and the client line that names CLA Title as the settlement agent are unchanged. Those name the company, not the person on this appointment.

**Links**

- Spec: [docs/specs/scheduling-agent-notary.md](docs/specs/scheduling-agent-notary.md). Source: Matt's Nov 17 Gemini notes, MF-058. Gmail 1a1e9eab7014ec5f. Matt confirmed Nov 17 2026, 10:30 AM ET.
- Builds on MF-056, [PR 302](https://github.com/Johncoester/cla-portal-demo/pull/302).

**Decisions**

- Confirmed is one checkbox on each side, next to that side's settlement agent/notary.
- Autosave replaces the Save button for those fields. Processor notes still use their own Save button.
- The reminder is email only. Addresses come from the file's parties. Nothing is typed into the program as a recipient.
- TEST's outbox cannot store a sent time, so the outbox row stays queued. The email itself goes out through Gmail send from the processor's connected mailbox.
- The file closing date is not written.

---

## Task grid party status (MF-053)

**How it should work.** On the Processor Task Grid, the columns are File No, Property and Closing Date, then Buyer, Seller, Buyer's Agent and Listing Agent. The individual task columns that used to continue to the right are not shown. A green check means every task for that party on the file is done. A red X means any of that party's tasks is overdue (past its due date and not completed). The cell is empty when that party's tasks are still open and not overdue, and blank when that party is not on the file.

**Status: In progress.** Tracker row MF-053. Pull request: [PR 303](https://github.com/Johncoester/cla-portal-demo/pull/303). No database change. Not Live until this is merged and checked on TEST.

**What's built**

- The Task Grid shows only File No, Property, Closing Date, Buyer, Seller, Buyer's Agent and Listing Agent. The task columns to the right are gone.
- The marks use the same green check and red X as before. An overdue task wins over completed tasks for that party. Cancelled tasks are ignored.
- An open task that is not overdue shows nothing. A party who is not on the file leaves the cell blank. A person on the file who has no tasks yet gets an empty cell, not a check.
- The columns sort the same way: overdue first, then open, then complete. A blank party cell stays last.
- Who is on the file comes from one read of the parties for the whole grid, together with the tasks the grid already loads. There is no extra read per file.
- Whether a party's tasks are done, overdue, or still open is decided in one helper, `partyTaskMark`. A task shared by more than one buyer or seller counts as done only when every copy is done. MF-057 can change that check in the same helper.

**What's still missing**

- Matt has not restated the exact column list since Nov 12. Confirm with him that the order is Buyer, Seller, Buyer's Agent, Listing Agent.
- The Modules page still describes the Task Grid as "tasks across the top."
- Not Live until this is merged and an Admin checks it on TEST. MF-057, the file-task checkbox for two buyers or two sellers, is a separate change.

**Links**

- Spec: [docs/specs/task-grid-party-status.md](docs/specs/task-grid-party-status.md)
- Source: Matt's Nov 11 Processor User-Task Grid notes (Gmail 1a1cc5d934e36305); confirmed by email Nov 12, 8:47 AM ET; FF-086 item 1, confirmed Nov 16, 10:45 AM ET. Tracker row MF-053.
- Related pull requests: [PR 266](https://github.com/Johncoester/cla-portal-demo/pull/266) added the four party columns and kept the task columns. [PR 303](https://github.com/Johncoester/cla-portal-demo/pull/303) drops the columns to the right. No database file.

**Decisions**

- Matt confirmed on Nov 12 at 8:47 AM ET: four columns (Buyer, Seller, Buyer's Agent, Listing Agent); open-but-not-overdue shows nothing; a missing party leaves the cell blank. File number, property and closing date stay.
- On Nov 16 at 10:45 AM ET Matt said yes to dropping everything to the right of the fields he specified. He did not restate which fields, or their order. This build uses the Nov 12 list and asks him to confirm the order.

---

## Party task completion (MF-057)

**How it should work.** Buyer and seller tasks are one copy per person. When a file has two or more buyers, or two or more sellers, that task counts as finished only after every person on that side has finished their own copy. Until then it stays open for staff, on the task list, on the Task Grid and in the dashboard file counts. The task shows how far along it is, such as "1 of 2 done", and names who still needs to finish. Each buyer or seller still sees and completes only their own copy. A file with one buyer or one seller works the same as it does today.

**Status: In progress.** Tracker row MF-057. Pull request: [PR 299](https://github.com/Johncoester/cla-portal-demo/pull/299). Not Live. The database file is not applied on TEST.

**What's built**

- Staff task lists, the file's task list, the Task Grid and the dashboard file counts wait until every buyer, or every seller, has finished that task.
- A task with two or more people on the side shows "1 of 2 done" (or N of M) and who still needs to finish.
- One person on the side is unchanged. Agents and staff tasks are unchanged. Each person still completes their own copy.

**What's still missing**

- Matt has not yet confirmed the "1 of 2 done" wording or that the names of who still need to finish are shown only to staff.
- Not Live until this is merged and the database file is applied on TEST.

**Links**

- Spec: [docs/specs/party-task-completion.md](docs/specs/party-task-completion.md)
- Source: Matt Landsberg's Gemini notes "Portal Feedback Nov 16", FF-086 item 2. Matt confirmed "Yes" on Nov 16 2026, 10:45 AM ET. Tracker row MF-057.
- Related pull requests: [PR 299](https://github.com/Johncoester/cla-portal-demo/pull/299). Database file `supabase/migrations/20261124100000_party_task_completion.sql` (not applied on TEST).

**Decisions**

- The progress line is the default answer to the open question: show "N of M done" and the names of who still need to finish. Staff see it. A buyer or seller still sees only their own copy as done or not done. Matt should confirm this.
- The rule lives in one helper (`js/data/party-task-completion.js`) so the Task Grid party columns (MF-053) can use the same definition of "complete".

---

## Any staff role on a file (ANYROLE-1)

**How it should work.** At the admin level, each login still has one account role. On a file, any active staff login (Super admin, Admin, Processor, Preprocessor, Sales Person, Sales Team or Transaction Coordinator) can be picked as the Processor, a salesperson, the Transaction Coordinator, or a party such as the buyer, seller, buyer agent, listing agent or lender. A staff login added as the buyer or seller can open that file in the portal. Demo and real logins stay in their own world. The CRM Owner field is unchanged.

**Status: In progress.** Tracker row ANYROLE-1 (Requests row 288). Pull request: [PR 258](https://github.com/Johncoester/cla-portal-demo/pull/258). It includes a database change that must be applied on TEST after this merges, before the item is marked Live.

**What's built**

- The Processor, salesperson and Transaction Coordinator lists include every active staff role in the same real or demo world. Edit order details labels the signed-in person with "(you)". Names with extra spaces, such as a trailing space in a first name, display as a normal name.
- A staff login can be added as a buyer, seller, agent, lender or other party from Place Order or File Contacts. If they do not already have a contact record, one is created and linked to their login so they can open the file.
- A Sales Person (or other staff who do not run orders) added as a buyer or seller sees that file in their portal in the buyer or seller view. Super admins, Admins and Processors keep the staff file view and still see themselves listed as a party.
- An outside user still cannot be added as CLA staff.

**What's still missing**

- The database change is not applied on TEST yet (it waits until this pull request merges). An Employee (HR-only) login is not offered on files, because that role has no order work.
- A Super admin who is also the buyer still sees the staff File Overview, not the buyer overview. They can open the file and are listed as the buyer.

**Links**

- Spec: none yet. Source: John, call + chat 3:07 PM ET Nov 13. Tracker row ANYROLE-1.
- Related pull requests: [PR 258](https://github.com/Johncoester/cla-portal-demo/pull/258).

**Decisions**

- John confirmed "add every role" and approved the recap in chat at 3:07 PM ET Nov 13 (t1637u, t1638u). Account roles stay the same at the admin level; only the file-level pickers open up.
- Nov 14: this pull request was brought up to date with main, including AF-7 (one place for commissions), FF-073 invites, MF-054 file overview, MF-045 Documents From, and FF-052 disbursement date. The database file stays `20261119150000_file_any_staff_roles.sql`. The later database files on main do not replace these functions.

---

## Type parties onto a file (FF-049 / MF-046)

**How it should work.** On Place Order, and when adding someone on a file's Parties list or Contacts, staff can type a buyer, seller, buyer's agent, listing agent, or lender. They do not have to pick an existing contact, and the portal does not create a login or send an invite. Email is checked when it is filled in, and it is not required. Picking someone already saved still works. For agents and the lender, the list shows companies and agents or loan officers, and a person and company can also be typed by hand.

**Status: In progress.** Not Live until this is on TEST and a processor has tried it there. No database file.

**What's built**

- Place Order buyer and seller rows take a name, email, and phone (and the entity fields that were already there). The search box remains for an existing contact. A typed name no longer stops on "pick a person from the list."
- Buyer's agent, listing agent, and lender: a list of saved companies and agents or loan officers, plus boxes to type a person and a company.
- The same entry is on the file's Parties buttons and on Contacts → Add contact.
- A typed person is stored as a contact with no portal login. Invite to portal is unchanged and is still a separate action. An existing contact that is picked is not rewritten.

**What's still missing**

- Proof on TEST (testportal.clatitle.com) after this is merged. Not Live until then.

**Links**

- Spec: [docs/specs/file-parties.md](docs/specs/file-parties.md). Source: Francis, Nov 11 email via Matt's ticket; Francis confirmed option 3 on Nov 13, 2026, 9:14 AM ET. Tracker rows FF-049 and MF-046.
- Related pull requests: this change. No database file.

**Decisions**

- Francis chose option 3 on Nov 13 at 9:14 AM ET, with a list plus manual entry for agents and lenders. Typed people are saved as contacts so the file can show them and Invite to portal still works later. No login is created and no invite is sent. Who can see the file stays the same, because a contact with no login cannot open it.

---

## File processor on Parties and Contacts (PROC-1 / PROC-2)

**How it should work.** The Processor on a file is one person. Adding that person on the order's Contacts screen, with the role Processor, shows them on File Overview > Parties. Removing them from Contacts clears the Processor. Setting or clearing the Processor anywhere else (Edit order details, or Place Order, or the Processor row on File Overview) shows the same person on Contacts, or takes them off. Any active staff login can be the Processor. A contact with no portal login can still be listed on Contacts as Processor, and that listing is not the file's Processor. Only people who can already edit parties can change it from the row.

**Status: Live on TEST (Nov 15 2026).** Tracker row 294 (PROC-1) and tracker row 295 (PROC-2). John Coester, screen recording "Adding a processor" (Nov 14 2026, 1:55 PM ET; Drive file 19lS81bxUsHUwQPRdLXIGi79dmpFhXdn7), confirmed Nov 14, 2:00 PM ET, on order MD-26-97260. PROC-1 is [PR 271](https://github.com/Johncoester/cla-portal-demo/pull/271), merged at 9d84a0ed, and `supabase/migrations/20261122180000_processor_party_sync.sql` is applied on TEST. PROC-2 is [PR 272](https://github.com/Johncoester/cla-portal-demo/pull/272), merged at b6356798, with no database file.

**What's built**

- Contacts and File Overview were reading two different places. Contacts stored a person on the file with the role Processor. File Overview read the file's processor field, so it still said "Not specified" and showed the red "no processor yet" warning. They now stay in step both ways.
- A Super admin, Admin, Processor, Preprocessor, Sales Person, Sales Team, or Transaction Coordinator can be that person. An outside user is refused in plain words. A contact with no portal login can still be listed on Contacts as Processor, and that listing does not become the file's Processor.
- A one-time copy lines up existing fake TEST files (a demo file, a note that says it is fake, a DEMO- file number, or a generated file number whose contacts use example.test or example.com only). A file that also has another email address is left as it is. MD-26-97260 is not rewritten by that copy when a contact on it uses a CLA email. That database file is applied on TEST. To line a file up, remove the Processor and add them again, or set the Processor on Edit order details, and both screens match.
- On File Overview, people who can already edit parties can click the Processor row, or Choose processor / Change processor. A list of active staff logins opens. The choice is saved the same way as Edit order details, so Contacts shows the same person. Unassigned clears the Processor. Saving Unassigned when the file already has nobody says to choose a staff login or close the window, and the form stays open. A Sales Person, a buyer, or anyone else who cannot edit parties sees the row as it is, with no button.

**What's still missing**

- Nothing left to put this on TEST. PROC-1 and PROC-2 are Live.
- Open tasks that were tied to a previous Processor row are cancelled in the demo when that row is replaced. On TEST, removing the person with Remove from order still cancels those tasks. The automatic replace does not cancel them.

**Links**

- Spec: [docs/specs/file-processor.md](docs/specs/file-processor.md)
- Source: John Coester, Nov 14 2026, 1:55 PM ET, recording "Adding a processor". Tracker row 294 (PROC-1) and tracker row 295 (PROC-2).
- PROC-1: [PR 271](https://github.com/Johncoester/cla-portal-demo/pull/271), merged at 9d84a0ed. Database file `supabase/migrations/20261122180000_processor_party_sync.sql`, applied on TEST. PROC-2: [PR 272](https://github.com/Johncoester/cla-portal-demo/pull/272), merged at b6356798. No database file.

**Decisions**

- The file's processor field stays the one the rest of the portal already uses (notices, messages, the red warning). Contacts is kept as a matching row, not a second Processor.
- John confirmed this list on Nov 14, 2:00 PM ET. The role walkthrough on main was already failing for a separate reason. This change does not touch that walkthrough. Rule 9 was not waived.

---

## Contract intake AI

**How it should work.** A spec is still to come.

**Status: Planned.**

**What's built**

- Nothing that reads a contract automatically. Today, Place Order has an "Upload sales contract" box that saves the file to the order's documents as "Contract / addendum". In Accounting > Contract figures, staff type the contract figures in by hand and can note where each figure came from.

**What's still missing**

- Everything, starting with a spec.

**Links**

- Spec: to come.
- Related pull requests: none.

**Decisions**

- None recorded yet.

---

## Conversation recipients and HR Processor rights (MF-049)

**How it should work.** A Processor created in HR has the same menu and the same file sections as any other Processor, including Accounting when that module is Live. On a file, Start conversation offers only the people on that file (parties, agents, lender, transaction coordinator, and CLA staff assigned to the file). A processor can also type a name and email. That person gets the message the same way Share Files already reaches someone with no portal login: an invite email, and the message waits until they sign in.

**Status: Merged, waiting for a check on TEST.** Merged pull request: [PR 267](https://github.com/Johncoester/cla-portal-demo/pull/267). No new database file. Not Live until someone checks it on TEST. Part 1 of the original note (Accounting missing) was the Admin > Modules switch, turned Live on TEST on Nov 12. This change checks that an HR-created Processor is not still treated as an HR-only Employee.

**What's built**

- An employee whose HR designation is already Processor, Preprocessor, Sales Person, or Transaction Coordinator gets that portal role, including a login that was stored as Employee. Changing the designation to a title that is not one of those four, or archiving the employee, still returns those roles to Employee. A Processing Manager who is already a Processor stays a Processor. Admins and Super admins are left as they are.
- Start conversation lists only people on that file. A contact who exists only on another file is not offered.
- Processors and admins can type a first name, last name, and email. A bad email or a missing name stays on the form and says what to fix. If the email is already on the file and that person has a portal login, they are included. If they have no portal login, or they are not on the file yet, the sender picks buyer, seller, buyer's agent, or listing agent. The portal adds them to the file when needed, then uses the existing Share Files path: invite email, message held until they sign in.

**What's still missing**

- Nothing from the confirmed list. A typed person who is not a buyer, seller, or agent still cannot be invited; that is the same limit Share Files already has. Someone with no portal login still has to be the only person in that conversation.

**Links**

- Spec: [docs/specs/mf-049-conversations.md](docs/specs/mf-049-conversations.md). Source: Francis Santos, Nov 11 2026, "Missing Accounting Section and Conversation Recipient Issues" (forwarded with Matt's ticket). Francis replied "That's correct" the same day.
- Related pull requests: [PR 267](https://github.com/Johncoester/cla-portal-demo/pull/267). The file-only recipient list for the earlier video note is [PR 240](https://github.com/Johncoester/cla-portal-demo/pull/240) (FF-072). Share Files holding a message for someone with no login is [PR 251](https://github.com/Johncoester/cla-portal-demo/pull/251).

**Decisions**

- Francis, Nov 11: Processor 1 should match a regular Processor, the To list should be people on that file, and staff should be able to type a name and email. Francis, Nov 12: an HR-created Processor gets full normal Processor rights. A typed person who is not already on the file is added as a buyer, seller, buyer's agent, or listing agent so the existing invite-and-hold path can be used. No new send path.

---

## Task Builder

**How it should work.** A **Task Builder** page in the admin section where Admins and Super admins build automated workflows ("flows") for title files without code. Each flow starts when something happens on a file (the trigger: order opened, contract received, EMD received or not received after a number of days, title commitment received, closing date set or changed, a number of days before closing). Conditions pick which files it applies to (sales rep, client, transaction type, state, combined with and/or). Actions then run in order: create a task, send an email as a chosen person, create a call task, wait, check again, continue or stop. Each task a flow creates says who it's assigned to (a role on the file or a named person), an optional backup person, who can see it (CLA only, or also the agent, buyer, seller or lender), and its due date. The end goal is a drag-and-drop flowchart screen. This replaces "Workflow definitions" (PR 7, closed) and builds on Task Templates (PR 141).

**Status: In progress. TB-1 Live on TEST (Nov 14). TB-2 merged (PR 263, Nov 14); not Live until its database file is applied on TEST. TB-2b (Try on one file, new files only) pull request open.**

| Step | What | Status |
|---|---|---|
| TB-1 | Admin page and permissions, list of flows (name, what starts it, On / Off), history (Owner: Claude) | Live on TEST, [PR 261](https://github.com/Johncoester/cla-portal-demo/pull/261). Grok checked steps 1–7 on TEST, Nov 14 |
| TB-2 | Flow engine: conditions and actions, simple form; the EMD reminder working on TEST (Owner: Claude) Merged, [PR 263](https://github.com/Johncoester/cla-portal-demo/pull/263). Not Live until `20261121010000_task_flow_engine.sql` is applied on TEST |
| TB-2b | Try on one file; turning on asks new files only or existing open files too (John, Nov 14) (Owner: Claude) | [PR 265](https://github.com/Johncoester/cla-portal-demo/pull/265) open. Not Live until `20261122010000_task_flow_try_and_scope.sql` is applied on TEST, after TB-2's file |
| TB-3 | Task settings: assigned to (role or named person), optional backup person, who can see it | Planned |
| TB-4 | Email actions with templates and "send as" | Planned |
| TB-5 | Drag-and-drop flowchart screen | Planned |

**What's built**

- TB-1: **Admin > Task Builder**, its own menu item, for Admins and Super admins only (everyone else gets "Not authorized"). It lists flows with name, description, what starts it, On / Off, and who changed it last. **+ New flow** and **Edit** take a name, what starts it, days (for "EMD not received" and "Days before closing") and a description. New flows start Off; Turn on / Turn off switch them; nothing is deleted. A History card shows every change.
- TB-2: each flow says **which files** it applies to (transaction type: purchase, cash purchase or refinance; state; sales person — blank means any) and has **steps** run in order: create a task, create a phone call task, wait a number of days, or stop if the EMD has been received. A task goes to everyone on the file with the chosen role (processor, pre-processor, sales person, buyer's agent, listing agent, buyer, seller, transaction coordinator, lender). The page shows each flow's steps, recent runs (flow, file, status, latest step) and a **Check files now** button. A flow needs at least one task step before it can be turned on. The database starts flows when an order is opened, the EMD is marked received, or the closing date is set or changed, and every 15 minutes checks the day-based triggers and waits. Nothing in it can stop an order from saving.
- TB-2b (John, Nov 14): **Try on one file** runs a flow once on a chosen open file, now, even while the flow is Off, with waits skipped so every step shows at once. Its tasks are real tasks on that file marked "Test run", and it never counts as the flow's real run there. **Turn on** asks which files: **New files only** (the default: files opened after it was turned on) or **Existing open files too**, so turning a flow on never sweeps the open files already there by surprise. An "Order opened" flow only ever runs on new orders. The list and History show which was picked.

**What's still missing**

- TB-2 and TB-2b are not Live: apply `20261121010000_task_flow_engine.sql`, then `20261122010000_task_flow_try_and_scope.sql`, on TEST (they need TB-1's file, already applied, and pg_cron, already on TEST). John wants to try it himself before Grok tests it.
- "Contract received" and "Title commitment received" can be saved but not turned on yet.
- On TEST a new order's flow tasks appear at the next 15-minute check (or **Check files now**), after Place Order has added the people.
- Named person, optional backup person, and who can see a task (TB-3); emails (TB-4); drag and drop (TB-5).
- Clients and agents can see tasks assigned to them but only staff mark them done (open question for John).

**Links**

- Spec: [docs/specs/task-builder.md](docs/specs/task-builder.md)
- Related pull requests: [PR 7](https://github.com/Johncoester/cla-portal-demo/pull/7) (workflow definitions, closed), [PR 141](https://github.com/Johncoester/cla-portal-demo/pull/141) (task templates with due dates), [PR 218](https://github.com/Johncoester/cla-portal-demo/pull/218) (roadmap: Workflow definitions as Planned)

**Decisions**

- John, Nov 13: its own admin menu item (not under Task Templates); Admins and Super admins only; tasks can be assigned by role or to a named person; a backup person is optional, added on each task. John, Nov 14: a flow can be tried on one file first, and turning it on defaults to new files only. Still open: whether clients and agents can tick off tasks.

---

## CRM Excel import (CRM-IMPORT-XLSX)

**How it should work.** On every CRM import screen (Import Leads, Import Clients, and Import Notes on either), an admin can pick a CSV or an Excel file (.xlsx or .xls). Windows' file picker was hiding Excel files because the box only accepted CSV. The first sheet is read. Dates show as month/day/year. Empty cells stay empty. The rest of the import is the same as a CSV: map the columns, preview, then import, with the same size and row limits.

**Status: Merged, waiting for a check on TEST.** Tracker row CRM-IMPORT-XLSX. Requested by John Coester, Nov 14 2026, 1:42 PM ET, after a screen recording of the file picker on Import Notes (on Leads). Pull request: [PR 270](https://github.com/Johncoester/cla-portal-demo/pull/270). Not Live until someone tries an Excel file on TEST. No database change.

**What's built**

- The upload box accepts .csv, .xlsx, and .xls. The heading and the help text say CSV or Excel. The Create New menu says the same.
- An Excel file's first sheet becomes the same rows the CSV import already uses. A file with more than one sheet says which sheet was used. A password-protected or unreadable file says what to do, in plain words.
- The spreadsheet reader is stored in the portal and loads only after an Excel file is picked.

**What's still missing**

- Not checked on TEST yet. Companies do not have their own import screen; this does not add one.
- A date cell that also has a time keeps the time after the date. A date with no time is month/day/year only.

**Links**

- Spec: [docs/specs/crm-import-excel.md](docs/specs/crm-import-excel.md)
- Related pull requests: [PR 270](https://github.com/Johncoester/cla-portal-demo/pull/270).

**Decisions**

- John, Nov 14: accept .xlsx and .xls on the CRM import screens built from the Janine import page, and keep mapping, preview, limits, chunks, the error CSV, and resume the same. Read the first sheet only. No database change.

---

## CRM import phone and website checks (CRM-IMPORT-PHONE-WEB)

**How it should work.** On Import Leads and Import Clients, Preview flags a Phone or Mobile that is not a 10-digit number. Eleven digits starting with 1 are accepted. A blank is fine. A web address with no http:// or https:// gets https:// in front when it is a real site. An address that is still not a web address is an error on that row, in plain words. Those rows are not imported.

**Status: In review.** John Coester confirmed this Nov 17 2026 as CRM import fix 3 of 5. Pull request: [PR 313](https://github.com/Johncoester/cla-portal-demo/pull/313). Not Live. No database change. The preview already draws each row's message, so the check runs in the hosted import before the database call.

**What's built**

- A short Phone or Mobile is an error on that row, with a plain reason, and is not sent. A leading 1 on an 11-digit number is stored as 10 digits, like 301-555-0101.
- A bare web address is sent with https:// in front, and the preview names the address it will save. An address that is not a site is a plain error on that row. A database check message is rewritten in plain words if one still comes back.

**What's still missing**

- Not checked on TEST yet. Import Notes does not use these fields.

**Links**

- Spec: [docs/specs/crm-import-phone-web.md](docs/specs/crm-import-phone-web.md)
- Related pull requests: [PR 313](https://github.com/Johncoester/cla-portal-demo/pull/313).

**Decisions**

- John, Nov 17: do this in the import preview, with no database change. A bad phone is skipped. A bare web address gets https:// when it is a real site.

---

## CRM import error CSV includes duplicates (CRM import fix 4 of 5)

**How it should work.** After a preview or an import, Download error CSV lists every row that was not imported. A row that failed a check is still there, with the same message as before. A row skipped as a duplicate is there too, with a plain reason: either it repeats an earlier row in the file ("Duplicate within file, row 3") or it matches a lead or client already in the CRM ("Duplicate of existing lead: Robin Template / robin.template@example.test"). The button shows when there are errors or duplicates. A file whose every row is ready does not offer the download.

**Status: In progress.** CRM import fix 4 of 5. John Coester confirmed this item. Pull request: [PR 316](https://github.com/Johncoester/cla-portal-demo/pull/316). No database change. Not Live until this is merged and someone tries a duplicate file on TEST.

**What's built**

- The error CSV keeps the row number, the original columns, and the message, and adds a Reason column.
- Duplicate rows are included. A repeat of an earlier email, phone, or note in the same file names that row. Any other duplicate names the lead or client already on file.
- Preview and the summary both offer the download when at least one row was skipped. The file is built in the browser in one pass, including a 10,000-row file. That helper is loaded at cache stamp 202611242290.

**What's still missing**

- Not checked on TEST yet. The import page is now loaded at cache stamp 202611242290, including from the portal shell, so a saved copy of the old page is not used.
- The earlier-imports list still opens a table of rows. It does not download this CSV.

**Links**

- Spec: [docs/specs/crm-import-error-csv.md](docs/specs/crm-import-error-csv.md)
- [PR 316](https://github.com/Johncoester/cla-portal-demo/pull/316). No database file.

**Decisions**

- John Coester confirmed CRM import fix 4 of 5. Client-side only. No SQL. Duplicate rows belong in the same error CSV as the other skipped rows.

---

## Recording calculator county (REC-CALC-1)

**How it should work.** On the Accounting tab, Calculate fees from CLA rates uses the order's county. If that county is not on CLA's rate list, the calculator stops and says so, in plain words, and it does not add fee lines. On Place Order and Edit order details, County is a list of the counties CLA has rates for in that state, so it cannot be typed wrong. A county already saved that is not on the list stays visible and is marked not matched until someone picks one that is.

**Status: Live on TEST (Nov 15 2026).** Tracker row 297 (REC-CALC-1). John Coester, Nov 14 2026, 6:07 PM ET, item 1 of the recording calculator fixes from Claude's review. [PR 276](https://github.com/Johncoester/cla-portal-demo/pull/276) is merged. No database file.

**What's built**

- A county the rate sheet does not know (for example Mongomery) no longer calculates state taxes by themselves. On a $600,000 Montgomery purchase that typo had left out $10,910 of county recordation and transfer tax. The screen says: "We couldn't find this county in CLA's rates. Pick the county from the list, then calculate again." No fee lines are produced.
- A county that is on the list, including Montgomery, still calculates the same way as before, including those county taxes.
- Place Order and Edit order details use a County list from CLA's rates, limited to the order's state. Leaving it blank still fills the county from the address or the ZIP. A saved county that is not on the list is shown as not matched so it can be read and replaced.

**What's still missing**

- Nothing left on this item.
- States other than Maryland, Virginia, the District of Columbia, and Florida still are not in CLA's rates. The calculator already said so, and it still does.

**Links**

- Spec: [docs/specs/recording-calculator-county.md](docs/specs/recording-calculator-county.md)
- Source: John Coester, Nov 14 2026, 6:07 PM ET, item 1 of Claude's review of the recording calculator. Tracker row 297.
- [PR 276](https://github.com/Johncoester/cla-portal-demo/pull/276). No database file.

**Decisions**

- When the county is not on the rate sheet, do not calculate at all. Do not fall back to state taxes only.
- The county list is the rate sheet's own county list for that state. A saved value that is not on it stays on the screen, marked not matched, until a listed county is chosen. Saving the rest of the order does not wipe that saved value.

---

## Recording calculator documents (REC-CALC-2)

**How it should work.** On the Accounting tab, Calculate fees from CLA rates asks how many documents to record and how many pages each one has. The four documents are the deed, the deed of trust, a release, and a power of attorney. A purchase with a loan starts at 1 deed of 3 pages, 1 deed of trust of 30 pages, and no release or power of attorney. Those counts are what the fee calculation uses. They are saved with the other calculator answers and come back the next time. A count or a page number that is not a whole number in the allowed range is pointed out in plain words, and nothing is calculated until it is fixed.

**Status: Live on TEST (Nov 15 2026).** Tracker row 298 (REC-CALC-2). John Coester, Nov 14 2026, 6:52 PM ET, item 2 of the recording calculator fixes from Claude's review. [PR 277](https://github.com/Johncoester/cla-portal-demo/pull/277) is merged. No database file.

**What's built**

- Documents to record, with a count and a pages box for the deed, the deed of trust (DOT), a release, and a power of attorney (POA).
- Starting counts match the calculator for that kind of file. A purchase with a loan: deed 1 and 3 pages, deed of trust 1 and 30 pages, release 0, power of attorney 0. A file with no loan starts with no deed of trust. A refinance still starts the way the calculator starts today, including one release. On a purchase, the release count that follows the payoffs is REC-CALC-3.
- The counts are sent into the fee calculation and saved with the other calculator answers, so they are filled in again next time.
- A count must be a whole number from 0 to 10. Pages must be a whole number from 1 to 500. Anything else shows a plain message under the list and does not calculate. What was typed stays on the screen.

**What's still missing**

- Nothing left on this item. The release count on a purchase is REC-CALC-3, and the live fee sheet is REC-CALC-4. Both are Live.

**Links**

- Spec: [docs/specs/recording-calculator-documents.md](docs/specs/recording-calculator-documents.md)
- Source: John Coester, Nov 14 2026, 6:52 PM ET, item 2 of Claude's review of the recording calculator. Tracker row 298.
- [PR 277](https://github.com/Johncoester/cla-portal-demo/pull/277). No database file.

**Decisions**

- Use the calculator's own starting counts for each kind of file. Do not set the release count from the payoffs in this change.
- Save the counts in the calculator answers already stored on each calculated fee. No new database file.

---

## Recording calculator releases (REC-CALC-3)

**How it should work.** On a purchase, Documents to record starts the release count at the number of payoffs on the file. The person can change that number. A count they already saved stays, even if the payoffs later change. A refinance is unchanged.

**Status: Live on TEST (Nov 15 2026).** Tracker row 299 (REC-CALC-3). John Coester, Nov 14 2026, 6:52 PM ET, item 3 of the recording calculator fixes from Claude's review. [PR 278](https://github.com/Johncoester/cla-portal-demo/pull/278) is merged. No database file.

**What's built**

- A purchase with no payoffs still starts at no releases. One payoff starts at one release. Two payoffs start at two.
- On a Montgomery purchase, one release is a Recording fees – Release line of $50, paid by the seller.
- If the person saves a different release count, that saved number is what comes back next time.
- A refinance still starts with the calculator's own release count. It is not set from the payoffs.

**What's still missing**

- Nothing left on this item. The live fee sheet is REC-CALC-4, and it is Live.

**Links**

- Spec: [docs/specs/recording-calculator-releases.md](docs/specs/recording-calculator-releases.md)
- Source: John Coester, Nov 14 2026, 6:52 PM ET, item 3 of Claude's review of the recording calculator. Tracker row 299.
- [PR 278](https://github.com/Johncoester/cla-portal-demo/pull/278). No database file.

**Decisions**

- Only purchases use the payoff count. A refinance keeps the calculator's starting release count.
- A saved release count wins over the number of payoffs. No new database file.

---

## Recording calculator live sheet (REC-CALC-4)

**How it should work.** Calculate fees reads CLA's live rate sheet. The form says when those rates were loaded. If the sheet cannot be reached, the form says so and the fees stay on the saved copy (November 16 since REC-CALC-5).

**Status: Live on TEST (Nov 15 2026).** Tracker row 300 (REC-CALC-4). John Coester, Nov 14 2026, 6:52 PM ET, item 4 of the recording calculator fixes from Claude's review. [PR 279](https://github.com/Johncoester/cla-portal-demo/pull/279) is merged at 8bc66f6c. Nothing else was left on this item. No database file.

**What's built**

- The form loads the live "CLA Fee Tables (Live - Calculator)" sheet with the calculator's own loader. No password is used. The sheet is already shared to anyone with the link.
- When that works, the form says "Rates from the live sheet, loaded [date and time]" in Eastern time, and the preview uses those rates.
- When it does not work, the form says "Using the saved copy from Nov 16 because the live sheet couldn't be reached" and the fees come from that saved copy.
- The portal's numbers are checked against the calculator for Montgomery, Prince George's, Baltimore City, DC under and over $400,000, Fairfax, and a Maryland refinance. Those checks use the saved copy.

**What's still missing**

- Nothing.

**Links**

- Spec: [docs/specs/recording-calculator-live-sheet.md](docs/specs/recording-calculator-live-sheet.md)
- Source: John Coester, Nov 14 2026, 6:52 PM ET, item 4 of Claude's review of the recording calculator. Tracker row 300.
- [PR 279](https://github.com/Johncoester/cla-portal-demo/pull/279), merged at 8bc66f6c. No database file.

**Decisions**

- Use the calculator's own loader. Do not change the calculator or the sheet.
- If the sheet needed a password, stop. It did not.
- Tests do not call the live sheet. A failed read is tested with a stand-in. No new database file.

---

## Recording calculator Virginia refinance and Hampton Roads fee (REC-CALC-5)

**How it should work.** A Virginia refinance that pays nothing off is taxed at the full deed-of-trust rate, not the refinance rate. Virginia purchases in Hampton Roads add the $0.06 per $100 regional transportation improvement fee, paid by the seller.

**Status: In review (Nov 15 2026).** John Coester, Nov 15 2026, after Claude's Lodestar comparison test (findings F1 and F2). Calculator change: [calculator PR 1](https://github.com/Johncoester/cla-closing-cost-calculator/pull/1). Portal copy: this pull request. No tracker row yet. No database file.

**What's built**

- The Hampton Roads row is on the live rate sheet (Transfer_Taxes row 103), so live quotes already include it.
- The portal's copy of the calculator code and its saved copy of the rates are refreshed to calculator commit 54d10a2. The saved-copy note now says Nov 15.
- New checks in test/test-fee-engine.js: Virginia refinance with and without a payoff, the Hampton Roads fee on Virginia Beach, and the Maryland original mortgagor note.
- Nov 16 (John, after Melissa's answers): a Maryland refinance with a payoff shows a note that the new-money-only recordation tax assumes the borrower signs the original mortgagor affidavit (Tax-Property 12-108(g)). The saved rate copy now also has Melissa's Nov 16 rates (Caroline recordation $5.00/$500; Caroline first-time buyer $75,000 in total; Baltimore City $22,000 transfer tax exemption at $249,900 or less), which are on the live sheet too. Calculator commit ee6825a.

**What's still missing**

- Nothing in the portal. The calculator pull request still needs John's OK to merge.

**Links**

- Spec: [docs/specs/recording-calculator-va-refi.md](docs/specs/recording-calculator-va-refi.md)
- Source: John Coester, Nov 15 2026, Lodestar comparison test (Calculator vs Lodestar Test sheet).

**Decisions**

- Anne Arundel lien certificate stays at $0 (Melissa, Oct 26 2026): Lodestar charges $50, but CLA does not order one there.
- tools/vendor-cla-calculator.js is no longer in the repo, so the copy was made by hand; VENDOR.json records the commit and checksums.

---

## Recording calculator finds every county (REC-CALC-6)

**How it should work.** Any county or independent city in Maryland, Virginia, Florida or DC gets fees from Calculate fees from CLA rates. A county with rows of its own on the rate sheet uses them. Every other county uses the statewide rows, the same as the quote calculator. Spellings that mean the same place match ("Hillsborough County", "City of Fairfax", "Saint Johns", "Prince Georges"). A name that is not a county of that state is still refused.

**Status: Built, not merged.** REC-CALC-6. Pull request: [PR 296](https://github.com/Johncoester/cla-portal-demo/pull/296). John Coester, Nov 15 2026 (voice: "make sure the fees are actually pulling to the portal", then "fix whatever's needed"), assigned to Claude. Built on top of REC-CALC-5 (PR 292, merged). No database file.

**What's built**

- Claude ran 23 orders through the fee engine against the fee sheet. The amounts matched everywhere it ran. Two orders got no fees at all: Virginia Beach City and Hillsborough County came back "We couldn't find this county". The rate sheet only names counties that have a row of their own (27 in Virginia, 2 in Florida), and the portal treated every other county as unknown.
- The county list on Place Order and Edit order is now the whole state: 24 in Maryland, 133 in Virginia, 67 in Florida. The names come from the Census table the portal already ships for the ZIP lookup.
- Same-place spellings match. "Fairfax" stays the county and "Fairfax City" the city, because Virginia has both.
- When a tax comes to $0.00 on a file (Montgomery recordation tax on a $100,000 principal residence), the preview now says so instead of silently leaving the line out.
- A test (`test/test-county-match.js`) calculates all 224 counties and cities and checks the two orders that failed.

**What's still missing**

- The tests use the saved copy of the rates, not the live sheet, because a test that needs the internet fails at random. A daily check that compares the live sheet with the saved copy and reports any difference is not built.
- The 23-order comparison checked recording fees and taxes. Title premiums and CLA fees were not compared line by line.

## Recording calculator Maryland loan above the price (REC-CALC-7)

**How it should work.** In Maryland, when the buyer's loan is bigger than the purchase price, Calculate fees adds county recordation tax on the part of the loan above the price. In Prince George's it also adds the 1.4% county transfer tax on that part. The buyer pays it. Each shows as its own line, such as "County recordation tax on loan above price".

**Status: In review (Nov 16 2026).** John Coester, Nov 16 2026, after Claude ran Francis's closed files through the calculator and Melissa Gamble answered. Calculator [PR 2](https://github.com/Johncoester/cla-closing-cost-calculator/pull/2) and this portal PR. No database file.

**What's built**

- The rule is in the calculator's own code (calculator PR 2), copied into `js/data/vendor/cla-calculator/`. The rate sheet does not change.
- The tax uses the price's bracket rate (Whole brackets) or the bands the loan reaches above the price (Montgomery's Marginal brackets).
- Nothing changes when the loan is at or below the price, on a cash deal or refinance, or outside Maryland. Virginia already taxes the whole deed of trust.
- The fee's explanation shows loan − price and the rate used.
- Checked against two closed files to the penny: MD-26-32159 ($63.25 + $158.02) and MD-26-32155 ($561 + $1,428).

**What's still missing**

- Nothing.

**Links**

- Spec: [docs/specs/recording-calculator-md-loan-above-price.md](docs/specs/recording-calculator-md-loan-above-price.md)
- Confirmed tax rules (all recording calculator work): [docs/specs/recording-calculator-tax-rules.md](docs/specs/recording-calculator-tax-rules.md)
- Source: John Coester, Nov 16 2026; Melissa Gamble's email reply, Nov 16 2026.

**Decisions**

- Melissa Gamble, Nov 16: collect recordation and transfer tax on the amount above the price. Assignment fees are not added to the price.
- The Baltimore City exemption split (Melissa: the exemption applies to the buyer's side) is not changed here. Lodestar and two closed files (Montgomery, Washington County) split it 50/50, so John decides first.

## Unused money-input files (TEST-CLEANUP-MONEY)

**How it should work.** The money helpers live in one place. A page file that only passes them through, and test loaders that only exist for that page file, are not kept.

**Status: In progress.** Tracker row 292 (TEST-CLEANUP-MONEY). John Coester, Nov 14 2026, 1:41 PM ET, after Claude approved PR 269 (TEST-CLEANUP-4). Not Live until this is merged. No database file. Nothing on a screen changes.

**What's built**

- The portal already reads the money helpers from the shared constants. The extra page file that only passed them through is removed.
- The money-save check reads those same helpers from the shared constants.
- The two test loaders that pretended the extra page file had failed are removed, and the test runner no longer loads them.

**What's still missing**

- Not checked as merged yet.

**Links**

- Spec: [docs/specs/test-cleanup-money.md](docs/specs/test-cleanup-money.md)
- Source: John Coester, Nov 14 2026, 1:41 PM ET, after Claude approved [PR 269](https://github.com/Johncoester/cla-portal-demo/pull/269). Tracker row 292.

**Decisions**

- A repo-wide search found no page, home page, smoke check, or walk-through import of these files. The only import was the money-save check, which now uses the shared constants.
- No cache stamp. No served page import changed. No database file.

---

## Edit File Number (FF-050)

**How it should work.** New files still get a number automatically. On a file, Configuration has Edit File Number so staff can change that file's number to match CLA's internal numbering or a transaction reference. The new number shows on Open Orders, the file header, and search. A number already used on another file is refused. The activity log keeps the old number.

**Status: In progress.** Tracker row 176 (FF-050). Francis's email, no video. John Coester, Nov 15 2026. Not Live until this is merged and `supabase/migrations/20261123020000_edit_file_number.sql` is applied on TEST.

**What's built**

- Configuration on the file overview, for staff who can already edit the file, with Edit File Number under it.
- The number is checked before it is saved. A blank number, a number that is too long, or a mark that is not allowed is pointed out in plain words, and what was typed stays on the form.
- A number already on another file is refused, and the old number stays.
- The activity log says the old number and the new one.
- A new order still gets a generated number.

**What's still missing**

- Not checked on TEST yet. Not Live until the database file is applied on TEST.

**Links**

- Spec: [docs/specs/edit-file-number.md](docs/specs/edit-file-number.md)
- Source: Francis's email, tracker row 176. No video.

**Decisions**

- Only staff who can already edit the file can change the number. A sales person, buyer, seller, or agent cannot.
- The database file writes the activity note when the number changes, and refuses a blank or duplicate number in the same words as the screen. New files still get their number from the existing automatic numbering.

---

## Cash to close from the order (QF-1)

**How it should work.** The sale price, the deposit and the loan amount show on the Closing Disclosure as read-only lines from the order, the way Qualia shows them in teal. They count in Cash to Close. They are not saved as extra fee rows. Staff change them on File Overview.

**Status: In progress.** QF-1. Francis's Qualia Fees / Closing Disclosure video, file MD-26-32954. John Coester, Nov 14 2026, 10:42 PM ET, "Fix it", option (a). Not Live until this is merged and checked on TEST. No database file.

**What's built**

- K.01 and M.01 are the sale price. L.01 is the deposit. L.02 is the loan amount. Each says "From the order" and cannot be typed over.
- On the video's figures (sale $625,000, loan $500,000, deposit $10,000, seller credit $3,000, borrower closing costs $36,610.67, and $847.36 of adjustments) cash to close is $149,458.03.
- A purchase with no sale price, or with no loan amount at all, is not called Balanced. A loan of 0 is a cash purchase.
- A typed fee already named Sale Price of Property, Deposit, or Loan Amount is kept, and the order figure for that line is not added again.

**What's still missing**

- Not checked on TEST yet. The other gaps in that video are not part of this item.

**Links**

- Spec: [docs/specs/cash-to-close-order-lines.md](docs/specs/cash-to-close-order-lines.md)
- Source: Francis's Qualia Fees / Closing Disclosure video, and John's email of Nov 14 2026, 10:42 PM ET, section 6.2 item 1.

**Decisions**

- Option (a): derive the lines when the page is read. Do not store them. That keeps the Nov 7 rule that contract figures are not a second copy on the fee ledger.
- A typed line with the same name is the one copy. The screen says to remove it if File Overview should be the source.

---

## Loan split (FF-053)

**How it should work.** Under Loan, Mortgage Brokerage and Mortgage Broker are two sections. Mortgage Brokerage is the company, with Edit and Switch. Mortgage Broker is the person: search and select people already saved at that brokerage, or add a new contact. One brokerage can have more than one broker.

**Status: In progress.** Tracker row 184 (FF-053). Francis confirmed it by email on Nov 11 2026, 2:37 PM ET. John Coester, Nov 15 2026, next weekend item. Pull request: [PR 284](https://github.com/Johncoester/cla-portal-demo/pull/284). Not Live until this is merged and `supabase/migrations/20261123030000_loan_broker_split.sql` is applied on TEST.

**What's built**

- Mortgage Brokerage shows the company name, with Edit Mortgage Brokerage and Switch Mortgage Brokerage.
- Mortgage Broker shows each broker's name, phone, and email. Search stays inside that brokerage. Add Mortgage Broker creates the contact. A second broker can be added.
- The loan officer and the lender processor stay under Lender contacts.
- Place Order still asks for the brokerage company name only.
- A blank brokerage, a blank broker name, or an email that is not valid is pointed out, and what was typed stays.

**What's still missing**

- Not checked on TEST yet. Not Live until the database file is applied on TEST.
- The brokerage contact name, phone, email, and address are FF-090, not this item. Switching the company does not remove brokers already on the file.

**Links**

- Spec: [docs/specs/loan-split.md](docs/specs/loan-split.md)
- Source: Francis, tracker row 184. Confirmed Nov 11 2026, 2:37 PM ET.

**Decisions**

- A broker is a lender contact marked Mortgage Broker, not a new role on the file. That keeps file access the same.
- The brokerage stays the company name already stored on the order. Contact name, phone, email, and address are FF-090.

---

## Mortgage brokerage contact (FF-090)

**How it should work.** Mortgage Brokerage on the file shows the brokerage company and its contact: name, phone, email, and address. Staff pick a saved broker or type one. The values stay on the file. The Settlement Statement and Closing Disclosure page 5 show that broker.

**Status: In progress.** Tracker row 326 (FF-090). Francis Santos, email Nov 16 2026, 3:10 PM ET (Gmail msg 1a1e5fbfe4183a9f). Medium. Pull request: [PR 305](https://github.com/Johncoester/cla-portal-demo/pull/305). Not Live. The database file is not applied on TEST.

**What's built**

- Mortgage Brokerage shows the company, contact name, phone, email, and address.
- Edit opens those fields. A saved-broker list works like the lender list: pick a person or a company, or type them. Save keeps the values on the file and can add the person as a mortgage broker.
- A blank company name, a phone that is not 10 digits, or an email that is not valid is pointed out, and what was typed stays.
- Someone who cannot edit the file sees the contact and no buttons. A buyer or a salesperson cannot save a change.
- Place Order asks for the same fields. They are optional.
- The Settlement Statement header names the mortgage broker. Closing Disclosure page 5, Mortgage Broker column, shows the company, address, contact, email, and phone.

**What's still missing**

- Not checked on TEST. Not Live until `supabase/migrations/20261124130000_brokerage_contact.sql` is applied on TEST and someone checks it there.
- NMLS and license numbers for the mortgage broker are not collected.

**Links**

- Spec: [docs/specs/brokerage-contact.md](docs/specs/brokerage-contact.md)
- Source: Francis Santos, Nov 16 2026, 3:10 PM ET. Tracker row 326.

**Decisions**

- The contact is stored on the file, the same way the lender contact is. A saved person can be picked. The address stays on the file because contacts do not keep an address.
- The company name already stored for FF-053 is the Name on the CD. A name typed only in CD details still shows when the file has no company.

---

## Earnest and commission panels (MF-051)

**How it should work.** Under Earnest and Commission, Listing Agent Commission and Selling Agent Commission are two panels, side by side. Each one is commission base × commission percent, plus an additional amount, equaling the commission amount. Paid by is Buyer, Seller, or Split. Split is a dollar amount from each. The base starts as the sales price. This is the layout of the Agent fees box.

**Status: In progress.** Tracker row 182 (MF-051), which is the same item as FF-051 (row 177) and FF-075 (row 274). Francis confirmed the numbered list on Nov 11 2026, 2:36 PM ET, and chose option 1 on Nov 13 2026, 12:46 PM ET. John Coester, Nov 15 2026. Pull request: [PR 285](https://github.com/Johncoester/cla-portal-demo/pull/285), merged. `supabase/migrations/20261123040000_earnest_commission_panels.sql` is applied on TEST. Not Live until the walkthrough is checked again.

**What's built**

- The Agent fees box shows Listing Agent Commission and Selling Agent Commission next to each other on a computer, and one under the other on a phone. The selling agent panel is the buyer's agent side.
- Commission base defaults to the sales price. The percent and the commission amount stay in step. An additional amount is added on top.
- Paid by can be Buyer, Seller, or Split. The two split amounts must add up to the commission amount.
- The admin fee and the other fees stay. A commission of 3% on a $950,000 sale is still $28,500, paid by Seller, when there is no additional amount.
- Accounting still gets the commission from Agent fees, in section H.
- The walkthrough reads the percent from Commission % and the dollar amount and payer from Commission amount. The database file finds the existing payer rule in the form Postgres stores (`payer = ANY (ARRAY[...])`).

**What's still missing**

- The database file was applied on TEST. Not Live until the walkthrough is checked again. The first apply stopped on the payer-rule check; it was applied again after that check was pointed at the form Postgres stores.
- A split, or a commission with its own base, is not rewritten when the sales price changes.

**Links**

- Spec: [docs/specs/earnest-commission-panels.md](docs/specs/earnest-commission-panels.md)
- Source: Francis, Earnest & Commission Section, Nov 11 2026, 10:02 AM ET, confirmed 2:36 PM ET. Option 1 confirmed Nov 13 2026, 12:46 PM ET.

**Decisions**

- Option 1: the panels are the Agent fees box, not a second commission section. The amounts stay in deal_agent_fees.
- The selling agent is the buyer's agent side already on the file. The panel title is Selling Agent Commission.

---

## Agent-side transaction coordinator (FF-088)

**How it should work.** When a processor places an order, the buyer's transaction coordinator and the listing transaction coordinator are the agents' coordinators. Each one is an outside contact, with or without a portal login. They are saved on the file and can be added or changed later from Parties or Order Contacts. The CLA Title Transaction Coordinator is still an active staff login.

**Status: In progress.** Tracker item FF-088. Francis Santos, Nov 16 2026, 3:10 PM ET (message 1a1e5fbfe4183a9f), on order MD-26-97386. Pull request: [PR 301](https://github.com/Johncoester/cla-portal-demo/pull/301). The Nov 16 database file is on TEST. Place Order still does not open the new file when an agent's coordinator is typed. Tracker item E2E-ORDER-1 (row 329). Pull request: [PR 308](https://github.com/Johncoester/cla-portal-demo/pull/308). Not Live until `supabase/migrations/20261124170000_agent_tc_role_check.sql` is applied on TEST.

**What's built**

- Place Order, Agents, takes a person, company, phone, and email for each side's coordinator. A bad email or a partial phone is pointed out, and what was typed stays. The order no longer reports the same staff-login sentence twice.
- Parties shows both coordinators, with Add or Change. Order Contacts can add either role and can edit the person's name, email, phone, and company.
- An outside contact, or an outside login, saves as that agent's coordinator. The same person is still refused as the CLA Title Transaction Coordinator. A staff login can still be that CLA coordinator.
- The new database file adds Buyer Agent TC and Listing Agent TC to the file's people-role list and keeps every role that list already allowed. No page file changed. No cache stamp.

**What's still missing**

- Not Live until `supabase/migrations/20261124170000_agent_tc_role_check.sql` is applied on TEST. Until then, typing a coordinator creates the order, leaves the coordinator off, and stays on Place Order.
- Invite to portal is not offered on these two roles. A person who already has an outside login can still be picked.

**Links**

- Spec: [docs/specs/agent-side-tc.md](docs/specs/agent-side-tc.md)
- Pull request: [PR 301](https://github.com/Johncoester/cla-portal-demo/pull/301)
- Source: Francis Santos, Nov 16 2026, 3:10 PM ET. Tracker item FF-088.

**Decisions**

- The agents' coordinators are their own roles (Buyer Agent TC and Listing Agent TC). They are not the CLA Title Transaction Coordinator.
- The staff rule stays for a row already saved under the old role name: only an active staff login can be stored as that role. TC-1 takes that name off Add contact. See Transaction coordinator on Add contact (TC-1).
- The Nov 16 file did not add the two roles to the people-role list. That list has to allow them, or Place Order creates the file and does not open it.

---

## Transaction coordinator on Add contact (TC-1)

**How it should work.** A transaction coordinator is an outside assistant to one or more real estate agents. On a file, that person's side follows the agent they work for. Add contact offers Buyer's transaction coordinator (works for the buyer's agent) and Listing transaction coordinator (works for the listing agent). It does not offer the old role name Transaction Coordinator, which listed only CLA staff. A file that already has someone under that old role still shows them.

**Status: In progress.** Tracker row 365, item TC-1. John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM. Wording confirmed 11:37 AM. Pull request: [PR 343](https://github.com/Johncoester/cla-portal-demo/pull/343). Not Live. No database file.

**What's built**

- Order Contacts → Add contact no longer lists Transaction Coordinator. The coordinator choices are Buyer's transaction coordinator: works for the buyer's agent, and Listing transaction coordinator: works for the listing agent.
- The same wording is on Place Order and on Parties when adding or changing a coordinator.
- A person already saved on a file as Transaction Coordinator still appears on Contacts and Parties. Nothing is deleted.

**What's still missing**

- Not on TEST until this pull request is merged. There is no database file to apply.
- Edit order details still has the file-level Transaction Coordinator field. Linking a coordinator from an agent profile, adding them automatically, and a TC contact type are other items.
- What a coordinator can do on a file, matching their agent, is TC-3.

**Links**

- Spec: [docs/specs/tc-1-add-contact.md](docs/specs/tc-1-add-contact.md)
- Pull request: [PR 343](https://github.com/Johncoester/cla-portal-demo/pull/343)
- Source: John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM. Tracker row 365, TC-1.

**Decisions**

- A transaction coordinator is an outside assistant to the buyer's agent or the listing agent. TC-1 said that on the choice. TC-5 (tracker row 370) replaces the two choices with one label, Transaction coordinator.
- The old role stays on files that already have it. New people are not given that role from Add contact.

## Transaction coordinator contact type (TC-4)

**How it should work.** A transaction coordinator is an outside assistant who works for one or more real estate agents. On a file they can do what their agent can do. That permission work is TC-3. The contact type itself is separate from the CLA Title staff role named Transaction Coordinator. CLA staff still have no contact type.

**Status: In progress.** Tracker row 368. John Coester, live call Nov 18 2026, 11:27 AM ET, confirmed 11:35 AM ET, clarified 11:37 AM ET. The contact type can be picked, and a new buyer or listing coordinator is saved as that type. Existing contacts keep the type they already have. Pull request: [PR 344](https://github.com/Johncoester/cla-portal-demo/pull/344). Not Live until `supabase/migrations/20261125230000_tc_contact_type.sql` is applied on TEST.

**What's built**

- Contact type lists offer Transaction coordinator. TC-5b takes the "outside, works for agents" words off that label. The note under the list still says this is an outside assistant and not a CLA Title staff role. The choice is on a contact, on Place Order, on the file's Contacts tab, and in the CRM.
- A new person typed as the buyer's or listing transaction coordinator is saved as that type, not as a Realtor. Someone already saved keeps their current type.
- The file's contact list, the user list, and the CRM lists can filter or group by the new type. The coordinator directory lists transaction coordinators separately from agents. Buyers and CLA staff are not in that list.
- The database file adds the type to the contact and lead checks and does not change existing rows. It is not applied on TEST.

**What's still missing**

- Not Live until the database file is applied on TEST. Until then, saving the new type on TEST is refused in plain words.
- Removing the CLA staff Transaction Coordinator role, linking a coordinator to an agent's profile, and adding a coordinator automatically are other items. What the coordinator can do on a file is TC-3.

**Links**

- Spec: [docs/specs/tc-contact-type.md](docs/specs/tc-contact-type.md)
- Pull request: [PR 344](https://github.com/Johncoester/cla-portal-demo/pull/344)
- Source: John Coester, Nov 18 2026, 11:27 AM ET. Tracker row 368.

**Decisions**

- The stored code is `agent_tc`. The words on screen say the person works for real estate agents and is not CLA Title staff.
- Existing contacts are not rewritten. A Realtor who is already on a file stays a Realtor.
- The CLA staff role named Transaction Coordinator is unchanged.

## Transaction coordinators linked to an agent (TC-2)

**How it should work.** A transaction coordinator is an outside assistant to one or more real estate agents, never a CLA Title staff login. On the agent's profile, and on that agent's contact, staff can link one or more coordinators. The agent can do the same on their own profile. One coordinator can be linked to several agents. The list can be added to and removed from. Order Contacts does not offer a Transaction coordinators button.

**Status: In progress.** Tracker row 366. John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM. Not applied on TEST. Not Live.

**What's built**

- My Agent Profile shows Transaction coordinators for the signed-in agent, with add and remove.
- Order Contacts does not show a Transaction coordinators button. Each row still has Invite to portal, Edit, and Remove from order. John Coester, Nov 19 2026, 10:18 AM ET, screenshot of order MD-26-97260: that button did not belong on this list. Tracker row TC-BTN-REMOVE.
- User List, Edit user, shows the same list for a realtor.
- A new person needs a name. A bad email or a partial phone is pointed out, and what was typed stays. A CLA Title staff login is refused. The same person is not linked twice. Removing the link keeps the person and does not take anyone off a file.
- The database file is `supabase/migrations/20261125240000_agent_tc_links.sql`. Who can see a link matches who can see the agent's contact. Removing the Order Contacts button does not change that file. The shell cache stamp for this button removal is 202611248200. Order Contacts is loaded at 202611248100.

**What's still missing**

- Not applied on TEST. Not Live.
- Linking a coordinator does not put them on a file. That is TC-3 (tracker row 367).
- A contact type named Transaction coordinator is TC-4. This list does not add that type.
- A coordinator's login acting as their agent is TC-3.

**Links**

- Spec: [docs/specs/agent-tc-links.md](docs/specs/agent-tc-links.md)
- Source: John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM. Tracker row 366. Button removal: John Coester, Nov 19 2026, 10:18 AM ET, screenshot of MD-26-97260 Order Contacts. Tracker row TC-BTN-REMOVE. [PR 371](https://github.com/Johncoester/cla-portal-demo/pull/371).

**Decisions**

- The link is stored on the agent contact, so an agent with no portal login can still have coordinators.
- The agent edits the list on their own profile, because that page is already theirs. Staff who run orders edit it from User List, Edit user. Sales can see the list there and cannot change it, the same as other contact edits.
- Order Contacts does not open the coordinator list. John Coester, Nov 19 2026, 10:18 AM ET: the button made no sense on that list, and he did not ask for it. Invite to portal, Edit, and Remove from order stay on the row.
- A coordinator is any outside contact. CLA Title staff, including the staff role Transaction Coordinator, cannot be linked here.

---

## Coordinator on the agent's file (TC-3)

**How it should work.** When a real estate agent is added as the buyer's agent or the listing agent, each linked transaction coordinator is added on that same side. No one picks buyer or listing for the coordinator. The same coordinator can be on both sides when they assist both agents. Removing the agent does not remove the coordinator. In their own login, on a file where their agent is the buyer's agent or the listing agent, they can do what that agent can do, and a task they finish says they did it on behalf of the agent.

**Status: In progress.** Tracker row 367. John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM, and 11:37 AM. Built on TC-2 (tracker row 366). The first apply on TEST failed on a syntax error in `private.file_role_of` and rolled back, so nothing from this file is on TEST. The database file is corrected in place. Not applied on TEST. Not Live.

**What's built**

- Adding the buyer's agent or the listing agent adds each linked coordinator on that side. A coordinator already on that side is not added again. A coordinator for both agents is on both sides.
- Saving a new link adds the coordinator to open purchase files where that agent is already the buyer's agent or the listing agent.
- Removing the agent leaves the coordinator on the file, including a coordinator someone added by hand.
- The coordinator's login is treated as their agent on that file: they see the file, finish the agent's tasks, schedule the settlement, and upload. The task says the coordinator completed it on behalf of the agent.
- The same coordinator is the buyer side on a file where their agent represents the buyer, and the listing side where that agent represents the seller.
- The database file is `supabase/migrations/20261125250000_agent_tc_on_file.sql`. The first copy used `private.outside_roles(pid, d)[1]`, which Postgres rejects. The corrected copy uses `(private.outside_roles(pid, d))[1]`. The rollback already used a column, not that call, so it did not need the same change. No page file changed, so the shell cache stamp stays 202611246000.

**What's still missing**

- Not applied on TEST. Not Live.
- The one-pass document list on the hosted portal still reads the coordinator's own row. A coordinator there sees a file they uploaded and a file marked for everyone. The mock portal already shows them the agent's side.
- A contact type named Transaction coordinator is TC-4.

**Links**

- Spec: [docs/specs/agent-tc-on-file.md](docs/specs/agent-tc-on-file.md)
- Source: John Coester, live call Nov 18 2026, 11:27 AM, confirmed 11:35 AM, and 11:37 AM. Tracker row 367.

**Decisions**

- The coordinator stays when the agent is removed. Staff remove the coordinator from Order Contacts when that person should leave. That way a coordinator added by hand is never dropped because the agent left, and a coordinator added from the link is not dropped either.
- Permission follows the link: the coordinator acts as the agent only while that agent is the buyer's agent or the listing agent on the file.
- The file role list an outside user is added as stays Buyer Agent, Listing Agent, Client-Buyer, and Client-Seller. The coordinator is not added as a second agent. Their login is given the agent's role for that file so the existing checks (tasks, scheduling, upload) apply. Both coordinator sides stay allowed, which the two-role rule would block if those roles were added to that list.

---

## Agents see only their own tasks (FF-101a)
## Transaction coordinator, one choice (TC-5)

**How it should work.** A transaction coordinator is an outside person who works for one or more real estate agents. On a file, their side follows the agent they are linked to. Add contact, Place Order, and Parties offer one choice, labelled exactly Transaction coordinator. There is no Buyer's or Listing prefix and no "works for" sentence. If the person is linked to the buyer's agent, the listing agent, or both on this file, that side is saved. If they are linked to neither, the form asks "Which agent are they linked to?" and lists the file's buyer's agent and listing agent. The stored roles stay the buyer-side and listing-side coordinator roles. Order Contacts and the Parties cards show Transaction coordinator. The agent's name may follow. They do not say "works for".
**How it should work.** On a file, the buyer's agent, the listing agent, and a transaction coordinator acting for them see only the tasks assigned to them. The general **Tasks** button and tab are removed for those people so they cannot open every task on the file. They keep **My Tasks**. Staff keep Tasks and My Tasks as they are today. A coordinator linked to the agent (TC-3) can still see and finish that agent's tasks.
**How it should work.** A transaction coordinator is an outside person who works for one or more real estate agents. On a file, their side follows the agent they are linked to. Add contact, Place Order, and Parties offer one choice, labelled exactly Transaction coordinator. There is no Buyer's or Listing prefix and no "works for" sentence. If the person is linked to the buyer's agent, the listing agent, or both on this file, that side is saved. If they are linked to neither, the form asks "Which agent do they work for?" and lists the file's buyer's agent and listing agent. The stored roles stay the buyer-side and listing-side coordinator roles. Order Contacts and the Parties cards show Transaction coordinator. The agent's name may follow. They do not say "works for".

**Status: In progress.** Tracker row FF-101a. Francis Santos, Nov 18 2026 11 AM meeting notes, confirmed by John Nov 18 2:13 PM ET. Not applied on TEST. Not Live.
**Status: In progress.** Tracker row 370, item TC-5. John Coester, voice call Nov 18 2026, about 1:51 PM ET. Pull request: [PR 350](https://github.com/Johncoester/cla-portal-demo/pull/350). Not Live. No database file.

**What's built**

- The file menu and agent pill tabs drop the general Tasks entry for a buyer agent, listing agent, or coordinator acting as them. My Tasks stays.
- Opening the old Tasks address as an agent still shows only My Tasks.
- The agent overview "outstanding" button opens My Tasks.
- The fake portal and the database file refuse agent reads of other parties' tasks. A coordinator still sees the agent's own tasks and can finish them on the agent's behalf.
- The walkthrough no longer looks for a Client-Buyer row on the buyer agent's tasks page. It checks My Tasks and only that agent's own tasks (E2E-FIX-A).
- The database file is `supabase/migrations/20261125280000_agent_own_tasks.sql` (with rollback). The shell cache stamp is 202611246300.
- Add contact, Place Order, and Parties offer one role, Transaction coordinator.
- The side is taken from the coordinator's links to the agents on that file. Linked to both agents saves both sides.
- If there is no linked agent on the file, a required question lists the file's buyer's agent and listing agent. If the file has neither agent, saving says to add one first. What was typed stays.
- Order Contacts and the Parties cards show Transaction coordinator. The agent's name may follow. A refinance still has no transaction coordinator. The shell cache stamp is 202611246200.

**What's still missing**

- Not applied on TEST. Not Live.
- Completing a client's intake for them from the agent login is not part of this change; agents no longer see those client tasks. The walkthrough check for that is E2E-FIX-A.
- Not on TEST until this pull request is merged. There is no database file to apply.
- Not Live.

**Links**

- Spec: [docs/specs/agent-own-tasks.md](docs/specs/agent-own-tasks.md)
- PR: [#355](https://github.com/Johncoester/cla-portal-demo/pull/355)
- Source: Francis Santos, Nov 18 2026 11 AM meeting notes (Gmail 1a1ef9d3d862da08), confirmed by John Nov 18 2:13 PM ET. Tracker row FF-101a.
- Spec: [docs/specs/tc-5-one-choice.md](docs/specs/tc-5-one-choice.md)
- Pull request: [PR 350](https://github.com/Johncoester/cla-portal-demo/pull/350)
- Source: John Coester, voice call Nov 18 2026, about 1:51 PM ET. Tracker row 370, TC-5.

**Decisions**

- Enforce in the UI first, and tighten the database so an agent cannot read other parties' tasks even outside the menu.
- Staff views are unchanged.
- A TC acting for an agent must still see and complete that agent's tasks (TC-3).
- The words on the choice are exactly Transaction coordinator. The side is not part of the label.
- The side comes from the existing agent links (TC-2) and the same buyer or listing side those links already use (TC-3). Nothing new is stored.
- The follow-up is only the question and the agents on this file. It is required when the side cannot be told from a link.

---

## Buyer agent walkthrough matches My Tasks (E2E-FIX-A)

**How it should work.** The role walkthrough, signed in as the buyer agent, opens Tasks on the test file and sees My Tasks with only that agent's own tasks. It does not see a Client-Buyer row or a way to complete the client's work.

**Status: In progress.** Tracker row E2E-FIX-A (Requests tab, row 391). John Coester, Nov 19 2026. Pull request: [PR 370](https://github.com/Johncoester/cla-portal-demo/pull/370). Not Live. No database file. Nothing on testportal.clatitle.com changes.

**What's built**

- The one walkthrough check in `tests/e2e-roles/specs/agent-complete-invite.spec.js` now looks for My Tasks, the Buyer's Agent tasks list, and only that agent's rows. It fails if a Client-Buyer or Client-Seller row is showing, or if "Fill in for client" or a Complete control for the client's work is on the page.

**What's still missing**

- Not merged. The other failures in Actions run 44513431332 are not part of this change.

**Links**

- Spec: [docs/specs/e2e-fix-a.md](docs/specs/e2e-fix-a.md)
- Pull request: [PR 370](https://github.com/Johncoester/cla-portal-demo/pull/370)
- Source: John Coester, Nov 19 2026. Tracker row E2E-FIX-A. Actions run 44513431332, failing since run 44452846353. FF-101a is [PR 355](https://github.com/Johncoester/cla-portal-demo/pull/355), merge 8b2ce856.

**Decisions**

- The test changed because FF-101a removed client tasks from the agent login on purpose. Completing a client task from that login stays out of scope. The check was not loosened to hide a bug (AGENTS.md rule 5).

---

## Transaction coordinator contact type label (TC-5b)

**How it should work.** The contact type for an outside transaction coordinator reads exactly Transaction coordinator. The dropdown, the outside-user type, and the User List filter use those words and no description. A contact type that is not on the list says to pick Realtor, Lender, Buyer/Seller, or Transaction coordinator. A User List filter saved with the older longer label still finds the same people. When the side cannot be told from a link, the form asks "Which agent are they linked to?" Leaving it blank says "Choose which agent they are linked to."

**Status: In progress.** Tracker row 370, item TC-5b. John Coester, voice call Nov 18 2026, about 1:51 PM ET, the same wording as TC-5. Pull request: [PR 362](https://github.com/Johncoester/cla-portal-demo/pull/362). Not Live. No database file.

**What's built**

- The contact type label is Transaction coordinator on the contact type lists, on an outside user's type, and on the User List filter.
- A bad contact type says: Pick a contact type from the list (Realtor, Lender, Buyer/Seller, or Transaction coordinator).
- A saved User List filter that still says "Transaction coordinator (outside, works for agents)" matches the same outside coordinators. The shell cache stamp is 202611247700.
- Add contact, Place Order, and Parties ask "Which agent are they linked to?" when the side is not known. Leaving it blank says "Choose which agent they are linked to."

**What's still missing**

- Not on TEST until this pull request is merged. There is no database file to apply.
- Not Live.

**Links**

- Spec: [docs/specs/tc-5b-type-label.md](docs/specs/tc-5b-type-label.md)
- Pull request: [PR 362](https://github.com/Johncoester/cla-portal-demo/pull/362)
- Source: John Coester, voice call Nov 18 2026, about 1:51 PM ET. Tracker row 370, TC-5b.

**Decisions**

- The stored code stays `agent_tc`. Only the words on screen change.
- The note under the list, that this is an outside assistant and not a CLA Title staff role, stays. John asked for the label itself to have no description.
- The older filter words are still accepted so a saved filter does not go blank.

---

## A coordinator cannot be the agent (TC-SELF-BLOCK)

**How it should work.** The transaction coordinator on a file is a different person from the agent they sit with. Adding the buyer's agent again as the buyer coordinator, or the listing agent as the listing coordinator, is refused. The same email counts as the same person. Linking an agent to themselves is refused. People already on a file stay there.

**Status: In progress.** Tracker TC-SELF-BLOCK. John Coester, Nov 19 2026, 10:18 AM ET, screenshot of TEST file MD-26-97260. Pull request: [PR 372](https://github.com/Johncoester/cla-portal-demo/pull/372). Updated onto main after [PR 371](https://github.com/Johncoester/cla-portal-demo/pull/371) merged. Not applied on TEST. Not Live.

**What's built**

- Order Contacts, Add contact to this order, refuses that person before anything is saved. The message is: This person is already the Buyer Agent on this order. A transaction coordinator must be a different person. The listing side names Listing Agent. What was typed stays on the form.
- Place Order uses the same check on the Agents step, before Next and before the order is placed. Parties uses it when a transaction coordinator is added.
- A different person is still added. The buyer's agent can still be the listing coordinator when the listing agent is someone else.
- The coordinator list on an agent refuses that agent, including when the typed email is the agent's email: This agent cannot be their own transaction coordinator.
- The database file is `supabase/migrations/20261125340000_tc_self_block.sql`, with a rollback. It refuses new rows only. It does not change or delete existing people. It must be applied on TEST. The link-table guard is installed because TC-2's table is already on TEST. The TC-2 file itself is not rewritten. The shell cache stamp is 202611248300, above PR 371 (202611248100–202611248200) and PR 368 (202611248000).

**What's still missing**

- Not applied on TEST. Not Live.
- A file that already has the agent saved again as the coordinator is left as it is. Removing that row is a separate cleanup.

**Links**

- Spec: [docs/specs/tc-self-block.md](docs/specs/tc-self-block.md)
- Pull request: [PR 372](https://github.com/Johncoester/cla-portal-demo/pull/372)
- Source: John Coester, Nov 19 2026, 10:18 AM ET. Tracker TC-SELF-BLOCK.

**Decisions**

- The check is the agent they would be linked to on that side. The buyer's agent is not blocked from being the listing coordinator for a different listing agent.
- A blank email does not count as the same person.
- The database guard is a before-insert trigger, not a check on existing rows, so a file that already has this mistake can stay until someone removes it. The pull request does not change TEST data.

---

## CRM history on a fresh database

**How it should work.** A brand-new database should build the CRM the way TEST did on November 2: the accounts, leads, pipeline, and activities, plus the feature flag. The scratch setup should not create those tables first, or the history file would leave them in the old shape.

**Status: In progress.** John Coester, Nov 15 2026, 5:23 PM ET (t1737u), Nov 16 2026, 10:46 AM ET (t1768u), Nov 16 2026, about 12:24 PM ET, and Nov 16 2026, 3:38 PM ET. Seven history statements match TEST. The clean load and the column comparison both pass. Pull request: [PR 293](https://github.com/Johncoester/cla-portal-demo/pull/293), merged. Nothing is applied to TEST. Not Live.

**What's built**

- Seven exact TEST history statements are in the migration folder, each labeled already applied on TEST: crm, crm_zoho, crm_settings, crm_email_templates, crm_nov3b, crm_calls, and crm_janine_nov3.
- The tables those statements create are no longer created by the scratch precondition. That includes `crm_list_exports`, which crm_calls creates.
- The six lead columns the November 12 check wants are added by those statements: crm_zoho adds crm_city, crm_county, crm_state, modified_at, and role_in_company; crm_settings adds custom.
- crm_calls adds the call and recording columns on activities. Its checksum is `5a567e14be2791c2849b779ffe13e4ff`, the same as TEST.
- The lead duplicate stand-in no longer creates `crm_leads_person_dup`. crm_nov3b creates that trigger. The live function is copied from `20261110040000_crm_person_dup_index.sql` into a hand change that runs just after it. Checksum `618de60d1b35841405a26ed27364ae8e`, the same as TEST.

**What's still missing**

- Nothing in the column list. PR 293 is merged. Nothing is applied to TEST, so it is not Live.

**Links**

- Spec: [docs/specs/crm-history.md](docs/specs/crm-history.md)
- Pull request: [PR 293](https://github.com/Johncoester/cla-portal-demo/pull/293)

**Decisions**

- The new file is named so it runs just before the existing feature-flag file, which is only the flag from this same history row.

---

## Taxes and fees documents (FF-091)

**How it should work.** On Taxes & Fees, the processor adds each document to record, fills in pages, consideration, taxable, and the exemptions that county uses, and calculates the recording fees, recordation tax, and transfer tax. Each line shows who it is paid to and who pays it. The lines land on the charges, the settlement statement, and the Closing Disclosure. A purchase starts with a deed and, when there is a loan, a deed of trust. A refinance starts with a deed of trust and, when there is a payoff, a release.

**Status: In progress.** FF-091. Francis Santos, Nov 16 2026, 3:10 PM ET (message 1a1e5fbfe4183a9f). Not Live. No database file. Not applied on TEST.

**What's built**

- Add document lists Affidavit, Assignment of Mortgage or Lease, Deed, Deed of Trust, Lis Pendens, Power of Attorney, Release of Mortgage, UCC, Lease, and Easement.
- Each document has pages, consideration, and taxable yes or no. Maryland and the District of Columbia ask primary residence, and a purchase asks first-time buyer, because those change the tax. Virginia and Florida do not ask, because they do not change the result. The file's primary residence and first-time buyer answers fill a new worksheet.
- Calculate fees uses the existing CLA calculator, including the full county list from REC-CALC-6 (PR 296, merged). A county without its own rows uses the statewide rates. It does not keep a second rate table. Apply writes the recording fees, the lien certificate, and the transfer and recordation taxes. Title premiums stay as they are. A line changed by hand is kept.
- A document the rate sheet does not price (an affidavit, a UCC, and the other four) is allowed. FF-091a shows Rate Not Set on that line instead of leaving the amount blank.
- Samples checked against the calculator: Baltimore City, Fairfax, the District of Columbia, Miami-Dade, Hillsborough (statewide Florida rates), and a Maryland refinance.

**What's still missing**

- The Qualia question about recording the security instrument at the same time as the deed is not on the rate sheet, so it is not shown.
- The e-recording fee still comes from Calculate fees from CLA rates on the Fee ledger.
- Not checked on TEST. Not Live.

**Links**

- Spec: [docs/specs/taxes-fees-documents.md](docs/specs/taxes-fees-documents.md)
- Source: Francis Santos, Nov 16 2026, 3:10 PM ET, message 1a1e5fbfe4183a9f. Tracker FF-091.

**Decisions**

- Reuse the vendored calculator. Do not copy the rate tables.
- Save the document answers on the calculated fee. No new database file.
- A saved worksheet wins the next time the screen opens, so a deed of trust marked not a principal residence stays that way. The file's answers are the starting point when nothing has been saved.
- Use the county list from REC-CALC-6 (PR 296, merged). A county in Maryland, Virginia, Florida, or the District of Columbia that is not named on a rate row of its own is still calculated, on the statewide rates.
- Baltimore City who-pays, and the order of exemptions then the split, are FF-091b.
- A blank county was treated as a missing address. That is FF-095.

---

## Baltimore City taxes and who pays (FF-091b)

**How it should work.** On Taxes & Fees, the tax is figured first, exemptions come off that total, and then the amount is split. The start is the county's default on the rate sheet. Staff can change Buyer pays, Seller pays, or 50/50 split for the executed contract, except a line the law fixes. That line stays locked and says why. Baltimore City uses the questions the rate sheet can answer: price, loan, pages, taxable, primary residence (the owner-occupied exemption), and the first-time homebuyer exemption.

**Status: In progress.** FF-091b. Francis Santos, Nov 17 2026, 1:55 PM ET (message 1a1eaddb3dcfc5d6) and Nov 17 2026, 3:55 PM ET (message 1a1eb4b8017fcabf). Not Live. No database file. Not applied on TEST.

**What's built**

- Baltimore City amounts follow the vendored rate sheet: transfer tax 1.5% up to $1,000,000 (2.1% above), with the $22,000 owner-occupant exemption only at $249,900 or less; recordation tax $5.00 per $500 up to $1,000,000 ($5.75 above), with the sheet's $22,000 owner-occupant exemption on that row. The exemption comes off before the split.
- The county default is a 50/50 split. A first-time buyer who will live in the home pays no state transfer tax, and Maryland law keeps that line with the seller.
- Staff can change the other taxes for the contract. The choice is saved on the calculated fee.
- A blank primary residence does not take the exemption.

**What's still missing**

- Recording the mortgage at the same time as the deed, and any statutory exemption the rate sheet does not list. Those are not asked. Editable rate sheets are FF-091c.
- Not checked on TEST. Not Live.

**Links**

- Spec: [docs/specs/taxes-fees-baltimore.md](docs/specs/taxes-fees-baltimore.md)
- Source: Francis Santos, Nov 17 2026, 3:55 PM ET, message 1a1eb4b8017fcabf. Tracker FF-091b.

**Decisions**

- Figure the tax, take the exemption off the total, then allocate. Do not take the exemption from one side of a split.
- The jurisdiction default is the rate sheet's Paid By. The contract choice is the control on Taxes & Fees.
- Lock only a line the law fixes, and show the reason. Maryland state transfer tax for a first-time buyer who will live in the home stays with the seller (Tax-Property 13-203).
- No new database file. No editable rate sheet in this change.

---

## Taxes and fees address (FF-095)

**How it should work.** On Taxes & Fees, a file that already has a street, city, and ZIP should not be told to add the property address. Calculate uses the county saved on the file. Baltimore City and Baltimore County stay different. When the county is blank, the ZIP fills it if that ZIP is in the file's state. When the ZIP belongs to another state, the screen says so and does not invent a fee.

**Status: In review.** Tracker FF-095. Francis Santos, email Nov 17 2026, 2:12 PM ET (Gmail message 1a1eaed436b0de49), signed in as Processor 2 on TEST. High, bug. Not Live. No database file.

**What's built**

- The red address message shows only when the street, the city, or the ZIP is missing. A blank county is no longer called a missing address.
- A saved county is used as a name. "Baltimore City" prices Baltimore City. "Baltimore County" prices Baltimore County. ZIP 21223, with the county left blank, is Baltimore City.
- When the city is Baltimore City and there is no ZIP, that city is the county.
- MD-26-97407 (street and ZIP filled, county blank, state Maryland, ZIP 33319) is told that ZIP 33319 is in Broward County, Florida, and to set the state to FL or pick the county. No Maryland fee is invented.
- MD-26-97386 already stores Baltimore City. Calculate still returns the recording fees and the taxes. The totals are not left at $0.00.

**What's still missing**

- The county found from the ZIP is not written back onto the file.
- The state is not changed to match a ZIP from another state.
- Not checked on TEST. Not Live.

**Links**

- Spec: [docs/specs/taxes-fees-address.md](docs/specs/taxes-fees-address.md)
- Source: Francis Santos, Nov 17 2026, 2:12 PM ET, message 1a1eaed436b0de49. Tracker FF-095. The Taxes & Fees screen is FF-091.

**Decisions**

- County stays a name. There is no county id to translate.
- A saved county wins over the ZIP and the city.
- A ZIP in another state is explained. The calculator does not switch the file to that state.
- No database file. Processors can already read the address columns. The rates stay in the vendored calculator.

---

---

## Tax rate sheets by place (FF-091c)

**How it should work.** Each state, county, and city has its own rate sheet. Taxes & Fees still shows Rate Not Set, who pays, and the first-time-buyer exemption the way they work today. The sheet prices the taxes and fees, takes the exemptions off the total, then splits what is left. The sheet supplies the starting split. Staff can change who pays to match the contract, unless the law fixes that line. An Admin can change a rate, an exemption, or a rule without a code change. A blank rate says Rate Not Set, and staff type the fee.

**Status: In progress.** Tracker FF-091c. Francis Santos, Nov 17 2026, 3:55 PM ET (Gmail message 1a1eb4b8017fcabf). Not Live. Database file `supabase/migrations/20261125170000_tax_rate_sheets.sql`. Not applied on TEST.

**What's built**

- Tables for places, rate lines, exemptions, questions, and the default buyer / seller split, with a flag when the law fixes the split. Staff can read. Only an Admin or Super admin can write. Row security enforces it.
- Admin, Tax rates: pick a place and edit the rate, the exemption, the question, and who pays. A blank amount is Rate Not Set.
- Taxes & Fees reads the tables. If they are not on the database yet, the rates already in the portal are the fallback. The screen keeps Rate Not Set, the who-pays buttons, the first-time-buyer exemption, and the aggregate adjustment as a reduction.
- The rates copied in are the ones already in the fee sheet for Maryland (Baltimore City and the counties on that sheet), Virginia, the District of Columbia, and Florida. Nothing was invented.
- Baltimore City, $200,000, owner-occupied: city transfer tax $2,670 and recordation $1,780 after the $22,000 exemption, then split. A first-time buyer pays no state transfer tax; the seller pays $500, and that line stays locked.

**What's still missing**

- Not applied on TEST. Not Live.
- Calvert, Carroll, Frederick, Somerset, and Wicomico have no county transfer tax in the sheet, so there is no line.
- No dollar rate for recording the mortgage at the same time as the deed, and no amount for "other statutory exemptions." Those questions are on the rate sheet. Taxes & Fees does not ask them, because the Live screen does not.
- The contract's split is still chosen on Taxes & Fees. It is not read from a named field on the order.

**Links**

- Spec: [docs/specs/taxes-fees-rate-sheets.md](docs/specs/taxes-fees-rate-sheets.md)
- Source: Francis Santos, Nov 17 2026, 3:55 PM ET, message 1a1eb4b8017fcabf. Tracker FF-091c.

**Decisions**

- Figure the tax, apply the exemption, then split. The $22,000 comes off the whole amount before a 50/50 split.
- Maryland state transfer tax for a first-time buyer who will live there stays with the seller. The "set by law" flag starts on for that line.
- A county keeps the statewide rows for any tax it does not replace.
- Do not apply the database file from this pull request.
- Keep the Live Taxes & Fees screen (Rate Not Set, who pays, first-time buyer) and the aggregate adjustment as a reduction.

---

## Rate Not Set on Taxes & Fees (FF-091a)

**How it should work.** On Taxes & Fees, a document or recording line with no rate in CLA's rates is not left blank. The line says Rate Not Set and staff type the fee. That amount saves, comes back after a reload, counts in the totals, and is marked entered by hand. Calculating again keeps it unless staff choose to replace it.

**Status: In review.** FF-091a. Francis Santos, Nov 17 2026, 1:55 PM ET, reply to the Taxes & Fees check (Gmail message 1a1eaddb3dcfc5d6), confirmed in the same day's recording-fees note (Gmail message 1a1eaed436b0de49, 2:12 PM ET). Pull request: [PR 324](https://github.com/Johncoester/cla-portal-demo/pull/324). Not Live. No database file. Not applied on TEST.

**What's built**

- An affidavit, assignment, lis pendens, UCC, lease, easement, or any other document the rate sheet does not price gets its own line: Recording fee, payee, and Rate Not Set. No amount is invented.
- Staff type the fee on that line. Apply saves it. The charges row says Entered by hand. The amount is in the section total, the settlement statement, and the Closing Disclosure.
- A blank fee is allowed and stays Rate Not Set, so the document is still visible. A value that is not a dollar amount stays on the form and says what to type.
- Calculate fees again keeps a saved hand amount. Replace the amount entered by hand is the choice that lets a new figure take its place. Clearing it returns the line to Rate Not Set.

**What's still missing**

- Not checked on TEST. Not Live.
- Baltimore City buyer, seller, or 50/50 transfer-tax choice is a different request from the same reply. It is not in this change.
- The address and county message on Calculate (FF-095) is a different fix.

**Links**

- Spec: [docs/specs/taxes-fees-rate-not-set.md](docs/specs/taxes-fees-rate-not-set.md)
- Source: Francis Santos, Nov 17 2026, 1:55 PM ET, message 1a1eaddb3dcfc5d6. The 2:12 PM ET note is message 1a1eaed436b0de49. Tracker FF-091a.
- Pull request: [PR 324](https://github.com/Johncoester/cla-portal-demo/pull/324)

**Decisions**

- No new database file. The line is a calculated fee whose rate amount is empty. The typed fee is the amount on the charge, so a later calculation sees it as entered by hand and leaves it.
- The typed fee is saved when Apply is clicked, including when the only change is that fee. Who pays stays as it was when the amount is replaced.

---

## Commission broker fee and payout (FF-101b)

**How it should work.** On the agent's Commission information task, the agent enters a broker fee and sees a read-only Total commission (their Agent fees commission for that side plus the broker fee). They also pick how to be paid: At settlement, FedEx overnight (with a mailing address), or Wire (with bank details). The account number shows last 4 only to people who are not the agent or the processor. Field names are ready for a future agent-profile default; that default is not built yet.

**Status: In progress.** Tracker FF-101b. Francis Santos, Nov 18 2026 11 AM meeting notes; confirmed by John Coester Nov 18 2026, 2:13 PM ET. Pull request: [PR 352](https://github.com/Johncoester/cla-portal-demo/pull/352). Database file `supabase/migrations/20261125290000_commission_broker_payout.sql` — not applied on TEST. Not Live.

**What's built**

- Commission information template v3 adds Broker fee ($), read-only Commission ($) from Agent fees, read-only Total commission, and payout method (At settlement / FedEx overnight / Wire) with the matching address or bank fields.
- Total commission uses the existing Agent fees math: the side's commission amount already includes any additional amount; Total = that amount + broker fee.
- An old page still cannot put a commission amount on this task (AF-8). Open copies move to v3; finished copies keep their version.
- Wire account numbers use the same mask path as seller proceeds (owner and processor full; others last 4).
- Demo adapter and unit tests cover save, total, FedEx/Wire validation, and masking. Cache stamp `202611247800` (above main’s FF-101c `6500`). Notes and `commission_task_guard` keep FF-101c Tasks wording.

**What's still missing**

- Database file not applied on TEST.
- Agent-profile default payout (John emailed Matt Nov 18 11:19 AM; not answered).
- Moving commission UI off File Overview into agent task sections (FF-101c).

**Links**

- Spec: [docs/specs/commission-broker-payout.md](docs/specs/commission-broker-payout.md)
- Source: Francis Nov 18 11 AM notes; John confirmed 2:13 PM ET. Tracker FF-101b.
- Related: Agent fees (AF-8), seller proceeds masking, FF-101c.

**Decisions**

- Commission $ stays in Agent fees (one place). This task shows it read-only and adds broker fee + payout only.
- Payout field keys match a future profile default; the profile default itself waits on Matt.

---

## Commission Paid By (FF-089)

**How it should work.** On Place Order, under Earnest money & agent fees, the listing agent and the selling agent each have Commission Paid By: Buyer, Seller, or Split. Split asks for the buyer's share and the seller's share, and the two amounts must add up to the commission. That commission then shows on the buyer side, the seller side, or both, on the settlement statement and the Closing Disclosure.

**Status: In review.** Tracker row 325 (FF-089). Francis Santos, email Nov 16 2026, 3:10 PM ET, Processor 2, TEST file MD-26-97386. Pull request: [PR 300](https://github.com/Johncoester/cla-portal-demo/pull/300). Not applied to TEST. Not Live.

**What's built**

- Earnest money & agent fees shows Commission Paid By on the listing agent and on the buyer's agent (the selling agent). Buyer, Seller, and Split. Split shows the two shares.
- The choice is saved in the Agent fees records that already exist (`payer`, `split_buyer`, `split_seller`). Accounting, the settlement statement, and CD section H already use those amounts.
- A blank share, a share that is not a number, or two shares that do not add up to the commission stays on the form and says what to fix.
- The Agent fees edit window on the file uses the same label, Commission Paid By.

**What's still missing**

- Not on TEST yet. Not Live.
- A split, or a commission with its own base, is still not rewritten when the sales price changes.

**Links**

- Spec: [docs/specs/commission-paid-by.md](docs/specs/commission-paid-by.md)
- Source: Francis Santos, Nov 16 2026, 3:10 PM ET, msg 1a1e5fbfe4183a9f. Tracker row 325 (FF-089).

**Decisions**

- Paid by was left off the Place Order screen. It was not hidden. PR 285 put Buyer, Seller, and Split on the Agent fees box (a different screen, after the file exists). PR 287 did not change that screen.
- No new columns. The same payer and split amounts are reused. No database file.
## Who can own a CRM record (CRM-OWNER-1)

**How it should work.** On Admin, then User List, then Edit user, an Admin or Super admin can tick **Can own CRM records** for that person. It starts off for everyone, including admins. A ticked person, whatever their role, can be chosen as the owner of a lead, client, company, or deal, in Change owner, and in a spreadsheet import. Someone who is not ticked is not in those lists. A record that already names them still shows their name. Who can open the CRM does not change.

**Status: In progress.** Tracker row CRM-OWNER-1, Requests tab row 315. John Coester asked on Nov 15 2026, 3:11 PM ET, and confirmed it on Nov 16 2026, 10:55 AM ET. Pull request: [PR 306](https://github.com/Johncoester/cla-portal-demo/pull/306). Database file `supabase/migrations/20261124140000_crm_owner_flag.sql`. The column and the guard are on TEST. Saving the tick is not, until CRM-OWNER-1b is applied. Not Live.

**What's built**

- The edit-user checkbox, saved only by an Admin or Super admin. The database refuses anyone else and writes the activity log (who, which user, old value, new value, when).
- Owner lists for leads, clients, companies, deals, Change owner, and the import Owner column use that tick. Existing names stay on the record.
- The save itself needs a separate grant. See CRM-OWNER-1b below.

**What's still missing**

- Apply the CRM-OWNER-1b grant on TEST, then have a Super admin tick a user, save, and reload. Do not mark Live before that. An owner list still needs a person to check it on TEST.

**Links**

- Spec: [docs/specs/crm-owner-flag.md](docs/specs/crm-owner-flag.md)

**Decisions**

- Nobody is turned on by the database file. An admin ticks people after it is applied.
- The tick does not change role access or who can open the CRM.

## Saving "Can own CRM records" (CRM-OWNER-1b)

**How it should work.** On Admin, then User List, then Edit user, an Admin or Super admin ticks **Can own CRM records** and chooses Save. The tick stays on after a reload. Anyone else sees the box locked and cannot change it. The database still refuses that person, and the activity log records a change that is allowed.

**Status: In progress.** Tracker row CRM-OWNER-1b. Janine Santos reported it by email to John on Nov 18 2026, 9:36 AM ET, with a screenshot. She is an active Super admin. The toast was "This was not saved: your login is not allowed to change this." A read-only check on TEST showed `authenticated` can read `profiles.can_own_crm` and cannot update it. The guard trigger was already there. Pull request: [PR 342](https://github.com/Johncoester/cla-portal-demo/pull/342). Database file `supabase/migrations/20261125210000_crm_owner_flag_grant.sql`. Not applied on TEST. Not Live.

**What's built**

- The database grant so a signed-in user may update that one column. The guard trigger is unchanged: only an active Admin or Super admin can change the tick, and the activity log still records who, which user, the old value, and the new value.
- The checkbox on Edit user is unchanged. It stays enabled for an Admin or Super admin.

**What's still missing**

- Apply the grant on TEST. Then sign in as a Super admin, tick the box for a user, save, and reload. The box should stay ticked. Do not mark Live before that.

**Links**

- Spec: [docs/specs/crm-owner-flag.md](docs/specs/crm-owner-flag.md)

**Decisions**

- The earlier database file is not edited. This file only grants the column.
- The shell cache stamp is 202611245200, above main's 202611245100, so a saved copy of the shell is not reused.

## Who can see and change a CRM record (CRM-VIS-1)

**How it should work.** An Admin or a Super admin can see and change every CRM record. Everyone else who can open the CRM can see every lead, client, company, pipeline opportunity, and activity, and can change or archive only the records they own. On a record they do not own, Edit and Archive are greyed out and the page says "Only the owner or an admin can change this record." A mass update, a change of owner, or another bulk action skips those records and says how many were skipped. A new owner must still be someone who can own CRM records.

**Status: In progress.** Janine Santos, the CRM user, confirmed this on Nov 18 2026. Designed by the portal lead. Tracker row CRM-VIS-1. Pull request: [PR 358](https://github.com/Johncoester/cla-portal-demo/pull/358), parenthesis fix [PR 366](https://github.com/Johncoester/cla-portal-demo/pull/366), rollback anchors [PR 367](https://github.com/Johncoester/cla-portal-demo/pull/367). Database file `supabase/migrations/20261125330000_crm_visibility_edit_own.sql` (already applied on TEST). Rollback `supabase/rollbacks/20261125330000_crm_visibility_edit_own.sql`. Not Live.

**What's built**

- Row security on leads, companies, pipeline opportunities, and activities: every CRM user can read them. An update is allowed for an admin, or when the owner column is the signed-in person.
- The same check inside the database functions that write those records, including archive, convert, close task, and client save. Mass update skips rows the person does not own and returns the count.
- Two extra policies on clients. They match only a contact that has a CRM stage, which is how a CRM client is marked. A person on a file is not included. Staff profile ids are looked up once per query. The portal's own contact policies are unchanged.
- The screen greys Edit and Archive and shows the plain note. Bulk actions skip records the person does not own.
- The rollback puts the company list and company detail back by a phrase that appears once. A shorter phrase also sat on the order counts, so the rollback stopped before it changed anything.

**What's still missing**

- Someone signs in as a salesperson, opens a lead they do not own, and checks that Edit and Archive are greyed out, then opens their own lead and saves a change. Do not mark Live before that.

**Links**

- Spec: [docs/specs/crm-visibility.md](docs/specs/crm-visibility.md)
- Before-definitions: [supabase/review/20261125330000_crm_visibility_before.sql](supabase/review/20261125330000_crm_visibility_before.sql)

**Decisions**

- `public.deals` is the shared portal order table. Its policies were read and were not changed. The CRM Deals tab stays on that table.
- Pipeline opportunities are `public.crm_opportunities`. They follow the same owner rule.
- Records are still archived, not erased. Archive is the delete on the screen.
- Cache stamp 202611247100.
- The rollback finds the company-list contacts count and the company-detail contact list, because `private.crm_in_pool(c.id)` also sits on the order counts. The forward file is unchanged.

## CRM owner on the User List (CRM-OWNER-2)

**How it should work.** On Admin, then User List, each person has a **CRM owner** checkbox beside **Admin**. It is the same tick as **Can own CRM records** on Edit user. An Admin or Super admin can turn it on or off from the row, without opening Edit. The Edit checkbox stays, and the two stay in step. Anyone else sees the box locked. A change is written to the activity log the same way as Edit. If the save fails, the box goes back and the message says what to do, in plain words.

**Status: In progress.** Tracker row 369, CRM-OWNER-2. John Coester asked in chat on Nov 18 2026, 11:49 AM ET, with a screenshot of Admin, then User List. Pull request: [PR 348](https://github.com/Johncoester/cla-portal-demo/pull/348). No database file. The column and the update grant from CRM-OWNER-1 and CRM-OWNER-1b are reused. Not Live until an Admin ticks a row on TEST, reloads, and sees the same tick on Edit user.

**What's built**

- A CRM owner checkbox on every User List row, beside Admin. Ticking it saves through the same update as Edit user.
- The Edit user checkbox is unchanged. The row and Edit read and write the same tick.
- Only an Admin or Super admin can change it. A removed person keeps the tick, and the box is locked. The activity log records who, which user, the old value, and the new value.
- A failed save puts the box back and shows a plain message. A database code is not shown.
- On a phone the list scrolls sideways and the box is large enough to tap.

**What's still missing**

- A check on TEST. Do not mark Live before an Admin ticks a row, reloads, and opens Edit for that person.

**Links**

- Spec: [docs/specs/crm-owner-flag.md](docs/specs/crm-owner-flag.md)

**Decisions**

- No new database file. The existing column and the update grant are enough.
- The shell cache stamp is 202611245700, so a saved copy of the User List is not reused.

## CRM custom view user criteria

**How it should work.** On Leads, Clients, Companies, and Deals, New Custom View, Specify Criteria, a field whose value is a person lists every CRM user, the same people as Share this with, Selected users. That includes super admins, admins, and sales reps. Choosing one saves that person's id, and the view shows records whose created-by, modified-by, owner, or last-activity person is that id.

**Status: Merged.** Feedback 30 item 1, confirmed by Janine. Pull request 309 is on main. Not Live until someone checks it on TEST. No database file.

**What's built**

- The criteria value list uses the share-with user list, loaded once. The signed-in person is included, because the filter can be "records I created."
- Created By, Modified By, Last Activity By, and the owner field are offered on Leads, Clients, and Companies. Deals offer Created By, Deal Owner, and Last Activity By.
- The saved value stays the user id. The view matches that id to the record.

**What's still missing**

- A check on TEST. Do not mark Live before that.
- Deals have no Modified By. A deal does not store who last changed the file.
- Clients Created By and Modified By on the hosted list are filled with one extra read of those two ids. If that read is blocked, those two client filters match only when the client list already includes the id. Leads, companies, deal owner, and deal Created By do not need that extra read.

**Links**

- Spec: [docs/specs/crm-view-user-criteria.md](docs/specs/crm-view-user-criteria.md)

**Decisions**

- Reuse the share-with user list. Do not switch the owner pickers on the record forms.
- Keep the stored criterion as the user id.

---

## Custom view name column can move

**How it should work.** On New Custom View and Edit view, Choose Columns, the record name (Lead Name, Client Name, Company Name, Deal Name) stays selected. The arrows move it like any other selected column, so Client Owner or another column can be first. The list for that view uses the saved order. The name still opens the record. A saved view that never stored a position for the name still shows the name first.

**Status: In progress.** Janine, Feedback 30 item 2, confirmed before this change. No database file. Not Live until this is merged and someone checks it on TEST.

**What's built**

- The name column can move up and down on Leads, Clients, Companies, and Deals, and it cannot be removed.
- The saved order is the order of the list. A missing name position stays first.
- The criteria user list from pull request 309 stays. Both work on the same custom view.

**What's still missing**

- A check on TEST after merge. Do not mark Live before that.

**Links**

- Spec: [docs/specs/crm-view-name-column.md](docs/specs/crm-view-name-column.md)

**Decisions**

- Janine asked to move the name, not to drop it. It stays required and it can sit in any selected position.
- An older view with no stored name position keeps the name first. A view that already stored a position keeps that position.

## New custom view starts with the All list columns

**How it should work.** On Leads, Clients, Companies, and Deals, New Custom View opens with the same columns, in the same order, as All Leads, All Clients, All Companies, or All Deals. A person's own column choice on that All list is the starting point. They can still add, remove, and reorder columns before saving. A view that is already saved keeps its own columns. The record name stays selected, in the place the All list already gave it, or first when the All list is not showing it.

**Status: In progress.** Janine Santos, Feedback 30 follow-up item 2, confirmed by email Nov 19, 2026, 6:30 PM ET. No database file. Not Live until this is merged and someone checks it on TEST.

**What's built**

- New Custom View for all four lists starts from the All list's columns, including a column choice saved on that login.
- Edit of a saved view still shows that view's columns.
- The name column can still move, and it cannot be removed. A list column the view cannot store, such as Source on Deals, is left out. Companies City on the All list is the City field on the view.

**What's still missing**

- A check on TEST after merge. Do not mark Live before that.
- A column change on the All list that has not been saved to the login yet is not copied if New Custom View is opened in that same moment.

**Links**

- Spec: [docs/specs/crm-new-view-all-columns.md](docs/specs/crm-new-view-all-columns.md)

**Decisions**

- No database file. The All list already stores a person's column choice.
- The All list and New Custom View share one column list, so the two cannot drift.
- The shell cache stamp is 202611249850, above main's 202611249800.

## Page load retry (LOAD-RETRY-1)

**How it should work.** Opening a page shows "Loading this page." while its files arrive. If GitHub Pages answers 503 for one file, the portal tries that load again. If it still fails, the loading line is replaced with "This page didn't load. Check your connection and try again." and a Reload button. The loading line does not stay on screen.

**Status: In review.** John Coester, Nov 17 2026, from walkthrough runs 44105290718, 44111742709, and 44117024772 on main. Tracker item LOAD-RETRY-1. No database file. Not Live until this is merged and someone checks it on TEST.

**What's built**

- A failed page load, and a failed load of the data connection, is tried again twice, a short pause apart.
- If it still fails, the person sees the plain message and Reload. The technical error is not shown.

**What's still missing**

- A check on TEST after merge. Do not mark Live before that.

**Links**

- Spec: [docs/specs/load-retry.md](docs/specs/load-retry.md)

**Decisions**

- Retry the same address. Chrome loads that file again, including a file nested inside the page. A different address would load a second copy and would not retry the nested file.
- The message tells the person what happened and what to do next. Reload reloads the whole page.
## CRM deal stage choices (Feedback 30 item 3)

**How it should work.** In CRM Deals, Stage offers Opened, Closed, On Hold, and Canceled. The same list is the value dropdown when a custom view filters Deals by Stage. An open order, which the CRM used to call Active, shows as Opened. Cancelled on the order shows as Canceled. The order page still stores Open, Closed, On Hold, and Cancelled. The numbered order step is unchanged.

**Status: In progress.** Janine, Feedback 30 item 3, confirmed before this change. Pull request: [PR 311](https://github.com/Johncoester/cla-portal-demo/pull/311). Database file `supabase/migrations/20261125100000_crm_deal_stage_labels.sql`. Rollback `supabase/rollbacks/20261125100000_crm_deal_stage_labels.sql`. Not applied on TEST. Not Live.

**What's built**

- The four stage choices on the deal record and in the custom view Stage filter.
- Active is read as Opened, including a filter that was saved as Active, before and after the database file.
- Someone who runs orders can change the stage on the CRM deal. That writes the existing order status.

**What's still missing**

- Not on TEST until the portal lead applies the database file. Do not mark Live before that.
- There is no separate Create Deal screen. Place Order still opens a new order, and the CRM shows it as Opened.

**Links**

- Spec: [docs/specs/crm-deal-stage.md](docs/specs/crm-deal-stage.md)

**Decisions**

- The order status column is shared with the rest of the portal, so its stored words stay Open, Closed, On Hold, and Cancelled. The CRM only changes the label.
- The numeric order stage (`deals.stage`) is not a CRM pick list and is not changed.

---

## CRM note edit (Feedback 27 item 1)

**How it should work.** On a Lead, a Client, or a Company, the person who wrote a note, or an admin, can open Edit, fix the words or add to them, and save. The note stays on that same record and shows Edited with the time. Nobody can delete a note. A processor still cannot change notes. A note the CRM wrote (such as Archived) cannot be edited.

**Status: In progress.** Janine, CRM Feedback 27 item 1, confirmed Nov 16 2026. Pull request: [PR 338](https://github.com/Johncoester/cla-portal-demo/pull/338). No database file. Not on TEST until this pull request is merged. Not Live.

**What's built**

- Edit, Save, and Cancel on a note the person wrote, and for an admin on any note a person wrote.
- A failed save keeps what was typed and says what to do. A blank note is refused. The original note stays.
- Edited and the time after a real change. A new note is not marked edited.
- The same notes list is already on Company records, so Edit is there too.

**What's still missing**

- A check on TEST after merge. Do not mark Live before that.
- Edit does not move a note onto another lead, client, or company.
- CRM deal records do not use this notes list.

**Links**

- Spec: [docs/specs/crm-note-edit.md](docs/specs/crm-note-edit.md)

**Decisions**

- No database file. The activity row already allows an update and already stores the edit time.
- Only the author, or an Admin or Super admin, gets Edit. A processor stays read-only. There is no Delete.

---

## CRM note file (Feedback 27 item 2)

**How it should work.** On a Lead, a Client, or a Company, the note box has a paperclip. The person adding a note, or the person editing a note they wrote (or an admin), can choose a file. That file shows on that note, with a link to download it. It does not show in the record's Attachments list. A note still needs words. There is no text formatting and no delete.

**Status: In progress.** Janine, the CRM user, confirmed Nov 16 2026. CRM Feedback 27 item 2. Pull request: [PR 341](https://github.com/Johncoester/cla-portal-demo/pull/341). A database file is included and has not been applied. Not Live until the lead applies it on TEST and someone checks a note there.

**What's built**

- A paperclip on Add Note and on Edit. The chosen file name shows before Save.
- The file is listed on that note, with the size and a download link. Anyone who can see the note can open the file.
- The same file is left out of Attachments.
- Until the database file is applied, the paperclip is hidden and the notes list says attaching a file is not available yet. Adding and editing the words still works.
- The same notes list is on Company records, so the paperclip is there too.

**What's still missing**

- The lead applies `supabase/migrations/20261125200000_crm_note_files.sql` on TEST. Do not mark Live before that, and not before someone checks it.
- A file cannot be removed. Notes and these files are kept.
- If the file is stored and the note row then fails to save, that copy stays in storage and is not shown. The person can choose the file again.
- CRM deal records do not use this notes list.

**Links**

- Spec: [docs/specs/crm-note-files.md](docs/specs/crm-note-files.md)

**Decisions**

- The file uses the existing CRM attachment table. `note_id` marks a note file so the Attachments list, which only reads rows with no `note_id`, cannot show it. The bytes go to the private `crm` bucket under `notes/`.
- Opening the file in storage is allowed only when that person can read the note. Adding a file also requires the right to edit that note (the author, or an admin). Those checks look up the note by its id. They do not add a per-row helper.
- One read of the attachment table covers every note on the record. There is no extra read per note.
- Only the author, or an Admin or Super admin, can add a file to a note that already exists. A processor stays read-only.

---

## CRM import file errors (CRM import fix 2 of 5)

**How it should work.** On Import Leads, Import Clients, and Import Notes for either one, the upload card always says the accepted files (.csv, .xlsx, .xls) and the limits (2 MB, 10,000 rows), and that the file window leaves other types out. A file that is not accepted shows the reason in red on that card, and the reason stays until another file is chosen. The reasons are the wrong type, a file over 2 MB, more than 10,000 rows, an empty or unreadable file, and a missing required column.

**Status: In progress.** CRM import fix 2 of 5. John Coester confirmed Nov 17 2026. Pull request: [PR 315](https://github.com/Johncoester/cla-portal-demo/pull/315). No database file. Not Live until this is merged and someone tries a bad file on TEST.

**What's built**

- The upload card lists .csv, .xlsx, and .xls, 2 MB, and 10,000 rows, and says the file window leaves other types out.
- A refused file stays in red on the card: wrong type, too big, too many rows, empty or unreadable, or a missing Last Name (people) or Note and Email or name (notes).
- That message is not a toast. Choosing another file replaces it. Closing the file window without a file leaves it. A refused file does not replace a file already accepted, and it does not clear a default already picked.

**What's still missing**

- Not on TEST until this is merged and someone checks Import Leads with a PDF and with a good CSV. Do not mark Live before that.
- Role in Company, Relationship Status, and State are still filled from Default values, so those columns are not required in the file.

**Links**

- Spec: [docs/specs/crm-import-file-errors.md](docs/specs/crm-import-file-errors.md)
- [PR 315](https://github.com/Johncoester/cla-portal-demo/pull/315)

**Decisions**

- The limits are the ones already in the import: 2 MB (`2_000_000` bytes) and 10,000 rows.
- The import page is loaded at cache stamp 202611242030, including from the portal shell, so a browser picks up the card.
- Last Name is required on the file for leads and clients. A note file needs a Note column and an Email or a name. Role, Relationship Status, and State can still come from Default values.

---

## CRM import buttons (CRM-IMPORT-1)

**How it should work.** On CRM Leads, Import Leads is the first button and uses the main button style. Import Notes is the quieter button after it. On CRM Clients, Import Clients is first and Import Notes is second. Import Leads opens the lead import. Import Clients opens the client import. Import Notes opens notes for that list. People were opening Import Notes by mistake because that button was first.

**Status: In progress.** Tracker row CRM-IMPORT-1. John Coester confirmed this on Nov 17, 2026 (CRM import fix 1 of 5). Pull request: [PR 312](https://github.com/Johncoester/cla-portal-demo/pull/312). Merged. Not Live until an admin checks Leads and Clients on TEST. No database file.

**What's built**

- On Leads, Import Leads comes first and uses the main button. Import Notes comes after it as the quieter button.
- On Clients, Import Clients comes first the same way, then Import Notes.
- The four addresses stay `#/crm/import/leads`, `#/crm/import/leads/notes`, `#/crm/import/contacts`, and `#/crm/import/contacts/notes`.

**What's still missing**

- A check on TEST. Do not mark Live before that.
- Companies still have no import button.

**Links**

- Spec: [docs/specs/crm-import-buttons.md](docs/specs/crm-import-buttons.md)
- Pull request: [PR 312](https://github.com/Johncoester/cla-portal-demo/pull/312)

**Decisions**

- Import Leads and Import Clients are the main action. Import Notes stays available, after them.
- Only an Admin or Super admin sees the buttons, same as before.

---

## CRM import preview row reasons (CRM-201)

**How it should work.** On Import Leads, Import Clients, and Import Notes, Preview shows one plain sentence and a reason on every row. If the preview call fails, the screen still shows those rows. It does not replace them with one generic failure. Nothing is saved by a preview.

**Status: In progress.** Tracker row CRM-201. John Coester confirmed this on Nov 17 2026 as CRM import fix 5 of 5. Pull request 139 (closed, not merged, Nov 12 2026) was the earlier attempt to stop the preview error from becoming a server error. The lead reported on Nov 17 2026 that `supabase/migrations/20261125110000_crm_import_preview_row_errors.sql` is applied on TEST. Not Live until someone checks a preview there.

**What's built**

- A finished preview returns each row (ready, duplicate, or the reason it needs a fix) and the sentence "Nothing was saved. Each row shows whether it is ready, a duplicate, or what to fix." The preview writes are rolled back inside the call.
- If the preview call fails and the row details are missing, each row that was sent says why, in plain words, and the same kind of sentence is shown above the list. A timeout is retried once, then described in plain words. Rows already checked stay on the screen.
- The import page shows that sentence above the row table.

**What's still missing**

- The lead reported the database file is on TEST. Live still waits for a person to preview a file there. Do not mark Live before that.
- The import page, the shell, and the hosted CRM module load at `202611242290`.

**Links**

- Spec: [docs/specs/crm-import-preview-rows.md](docs/specs/crm-import-preview-rows.md)
- Earlier attempt: [PR 139](https://github.com/Johncoester/cla-portal-demo/pull/139)

**Decisions**

- Return the preview as data instead of raising P0004. A P0004 on one row during a preview is kept on that row. A commit still re-raises it, so one assert still rolls that chunk back.
- Do not add a per-row helper. The chosen lead for a note stays the same. How that lookup runs is the speed follow-up below.

---

## Admin fee Payable by (FF-093)

**How it should work.** On a file, the Admin fee section has Payable by: Buyer, Seller, or Split (Buyer and Seller). The choice is saved on that file and is still there after a reload. Split means the buyer and the seller each pay half. An odd cent goes to the seller. The fee ledger, the settlement statement, and the Closing Disclosure use those same two amounts.

**Status: In review.** Tracker FF-093. Francis Santos, email Nov 17 2026, 1:37 PM ET (Gmail msg 1a1eacd7648484d9). Medium. Pull request: [PR 327](https://github.com/Johncoester/cla-portal-demo/pull/327). Not Live. The database file is not applied on TEST.

**What's built**

- Agent fees, Edit, Admin fee: Payable by with Buyer, Seller, and Split (Buyer and Seller).
- The choice is stored on the file. The next time the file opens, the same choice is selected.
- Split fills half and half. A $395 fee is $197.50 and $197.50. A $10.01 fee is $5.00 and $5.01, and the extra cent is the seller's.
- The fee ledger, the settlement statement, and Closing Disclosure section H put those amounts in the buyer and seller columns.
- A choice that is not one of the three is refused in plain words. The form stays open with what was typed.

**What's still missing**

- Not on TEST until `supabase/migrations/20261125130000_admin_fee_payable_by.sql` is applied there and someone checks a file. Do not mark Live before that.
- Place Order still takes the admin fee amount only. Payable by is on the file.
- Taxes & Fees does not include this admin fee. It is the recording and transfer calculation.

**Links**

- Spec: [docs/specs/admin-fee-payable-by.md](docs/specs/admin-fee-payable-by.md)
- Pull request: [PR 327](https://github.com/Johncoester/cla-portal-demo/pull/327)
- Source: Francis Santos, Nov 17 2026, 1:37 PM ET, message 1a1eacd7648484d9. Tracker FF-093.

**Decisions**

- Split for an admin fee is half and half. It does not ask for two typed amounts. A commission Split still does.
- An odd cent goes to the seller, the same way the recording calculator splits a tax.
- No new columns. The fee row already stores the buyer amount and the seller amount for a split.
- The shell cache stamp is 202611243082. Files this change does not edit keep main's stamps. CRM pages stay at 202611242290.

---

## Accounting Basic Info (FF-094)

**How it should work.** In Accounting, the section that was called Contract Figures is named Basic Info. It shows Sales price, Loan amount, Closing date, Disbursement date, and Source of business. How it was obtained, Source for this figure, Seller credit, the second Earnest money block, Warranty, HOA, Condo, Deferred, and Historical tax are not on that screen. The stored values stay, so other screens that already use them keep working.

**Status: In progress.** Tracker FF-094. Francis Santos, email Nov 17 2026, 1:37 PM ET (Gmail message 1a1eacd7648484d9), item 3. Medium. Pull request: [PR 321](https://github.com/Johncoester/cla-portal-demo/pull/321). Not Live. No database file. Not applied on TEST.

**What's built**

- The Accounting menu and the page heading say Basic Info. The five fields are the order's own figures, the same ones Place Order and Edit order details save. Saving does not open the old contract-term sheet, so a blank box cannot wipe a value that used to be on that sheet.
- Earnest money stays as its own card. The duplicate block at the bottom of the old sheet is gone. Commissions stay as the read-only Agent fees summary. Seller credit stays under Charges, L/N. A refinance has no sales price here.
- Sales, the sales team, and a transaction coordinator can read the form and cannot change it.
- The menu link that also said Basic Info and opened the file overview is now labeled Order overview.

**What's still missing**

- Other Charges has a card for the warranty cap and payer, the HOA and condo name, monthly dues, certificate balance and date, and the deferred amount, schedule, and payee. Those boxes read and write the columns already on the order. Not Live until someone checks Basic Info and Other Charges on TEST. The old transfer-fee figure stays stored and is not on this card.

**Links**

- Spec: [docs/specs/accounting-basic-info.md](docs/specs/accounting-basic-info.md)
- Pull request: [PR 321](https://github.com/Johncoester/cla-portal-demo/pull/321)

**Decisions**

- Remove the extra boxes from the screen only. Do not drop columns.
- Basic Info writes the order. It does not save the hidden contract-term sheet.
- TC Contract info is a different screen and stays as it is. The role walkthrough does not look for the words "Contract figures".

---
## CRM import note match speed

**How it should work.** On Import Notes, Preview still attaches each note to the same lead or client as before. An open person wins over an archived one. If several are open, or none are, the earliest created date wins. The preview should come back quickly when the lead list is large, instead of looking through every lead once per note row.

**Status: In progress.** No separate tracker row. The portal lead approved this as its own pull request on Nov 17 2026, after CRM-201 (PR 314). Not Live until the lead applies `supabase/migrations/20261125120000_crm_import_fast_lead_match.sql` on TEST. This pull request does not apply it.

**What's built**

- A note file matches every email in one pass. The tie-break is unchanged: open first, then the earliest created date. On a local scratch database with 110,000 leads, a 500-row note preview went from about 15 seconds to under half a second.
- An index on the lower-case email, then that same tie-break, for leads and for clients. The migration creates it if it is missing. On TEST it should be built outside a transaction first so writes are not blocked.
- The person duplicate check is unchanged. It already uses the open-email index and the phone index.

**What's still missing**

- Not on TEST until the lead applies the database file. Do not mark Live before that.
- A people preview still inserts one person at a time. This change does not make that path set-based.

**Links**

- Spec: [docs/specs/crm-import-fast-lead-match.md](docs/specs/crm-import-fast-lead-match.md)
- Builds on: [docs/specs/crm-import-preview-rows.md](docs/specs/crm-import-preview-rows.md)

**Decisions**

- Keep the chosen person exactly the same. Do not add a per-row helper. Do not change policies on deals, tasks, or profiles.
- Do not build the index with CONCURRENTLY inside the migration file. That statement cannot run inside a transaction. The file tells the lead to build it concurrently first, then run the file.

## Salespeople on Place Order (FF-092)

**How it should work.** On Place Order, Team & Notes, "Salespeople on this order" is a search box. Type a name or a role, pick one or more people, and each chosen person shows as a chip with Remove. The order saves the same salesperson ids as the old checkbox list. FF-092a later limited that list to Sales Person and Sales Team.

**Status: In review.** Tracker item FF-092 (Medium). Francis Santos, Nov 17 2026, 1:37 PM ET (Gmail message 1a1eacd7648484d9). Pull request: [PR 322](https://github.com/Johncoester/cla-portal-demo/pull/322). No database file. Not Live until someone checks it on TEST.

**What's built**

- The checkbox list is a search box. Arrow keys, Enter, and a click pick a person. Chosen people are chips. Remove takes one person off.
- A name that is not on the list says to try another name. If this login has no salespeople, the box says none are available.
- Add new user still adds an existing active salesperson, and a new salesperson login is still created in HR. Only an Admin sees that role.
- A draft in this browser keeps every chosen person.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- The Users page still links a client to salespeople with checkboxes. That screen was not part of this request.

**Links**

- Spec: [docs/specs/place-order-salespeople.md](docs/specs/place-order-salespeople.md)
- Pull request: [PR 322](https://github.com/Johncoester/cla-portal-demo/pull/322)

**Decisions**

- No database change. The saved field is still salesIds.
- FF-092 shipped the search list as every active staff login, the same people the checkbox list showed. FF-092a narrows that list. See the next section.

## Salespeople list is Sales Person and Sales Team (FF-092a)

**How it should work.** "Salespeople on this order" and Add a salesperson on a file list only users whose role is Sales Person or Sales Team. A salesperson already saved on a file still shows on that file. Task Builder still names a person already saved on a flow.

**Status: In review.** Tracker item FF-092a, a follow-up to FF-092. Janine, written answer Nov 17 2026, 6:26 PM ET. Pull request: [PR 335](https://github.com/Johncoester/cla-portal-demo/pull/335). No database file. Not Live until someone checks it on TEST.

**What's built**

- Place Order and both file pages offer only Sales Person and Sales Team in the salesperson list.
- A person already saved on a file still shows by name, and can still be removed.
- Task Builder keeps the name of a salesperson already saved on a flow when that person is no longer in the list.
- Saving still accepts an active staff login, or a user who can own CRM records. The CRM owner lists are unchanged.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.

**Links**

- Spec: [docs/specs/place-order-sales-roles.md](docs/specs/place-order-sales-roles.md)
- Follows: [docs/specs/place-order-salespeople.md](docs/specs/place-order-salespeople.md)

**Decisions**

- No database change. The saved field is still salesIds. The database still accepts any active staff login as a salesperson.
- The list uses the role strings Sales Person and Sales Team.

## Place Order walkthrough picks a real salesperson (E2E-FIX-B)

**How it should work.** The Place Order walkthrough, signed in as the non-demo E2E Processor, searches Team & Notes for a salesperson who is not a demo user. A name that is not a person still says no match. The file-number prefix checks stay as they are.

**Status: In progress.** Tracker row E2E-FIX-B (Requests tab, row 390). John, Nov 19 2026. Pull request: [PR 369](https://github.com/Johncoester/cla-portal-demo/pull/369). No database file. Not Live. Nothing on testportal.clatitle.com changes.

**What's built**

- On TEST the walkthrough searches E2E Salesperson, checks that name on the chip, and checks that one salesperson id is saved.
- A nonsense name still shows "No match."
- The fake-data run still searches Sam Salesperson, the sample salesperson, who is not a demo user.

**What's still missing**

- Not merged. Do not mark Live. There is no database file, and the walkthrough has not been run again on TEST.
- The file-number prefix checks were not reached in recent runs, because the walkthrough stopped on the old name. This change does not prove those checks.

**Links**

- Spec: [docs/specs/e2e-fix-b.md](docs/specs/e2e-fix-b.md)
- Pull request: [PR 369](https://github.com/Johncoester/cla-portal-demo/pull/369)
- Evidence: Actions run [44513431332](https://github.com/Johncoester/cla-portal-demo/actions/runs/44513431332), failing since run [44163727716](https://github.com/Johncoester/cla-portal-demo/actions/runs/44163727716) after FF-092 ([PR 322](https://github.com/Johncoester/cla-portal-demo/pull/322), commit 8dbc9be1).

**Decisions**

- The test used a demo-only name. Sam Demo is hidden from the non-demo processor on purpose. The TEST search is E2E Salesperson. The portal code is unchanged (rule 5).

---

## Aggregate adjustment (FF-096)

**How it should work.** On Escrow, line 08 Aggregate adjustment, an amount typed as -$1,200, ($1,200), or $1,200 comes off the section total. It also comes off the borrower's totals, the Closing Disclosure, the settlement statement, and the fee ledger.

**Status: In progress.** FF-096. Francis Santos, email Nov 17 2026, 2:20 PM ET (Gmail message 1a1eaf4ac2ad6496), Processor 2 on TEST. Not Live. No database file. Not applied on TEST.

**What's built**

- Escrow line 08 accepts a minus sign, parentheses, or a dollar amount. The line is stored as a positive borrower charge that lowers the total.
- Homeowner's insurance $1,368.00 plus property taxes $3,568.00 minus an aggregate adjustment of $1,200.00 totals $3,736.00. The same $1,200.00 comes off the borrower's debits, cash to close, the Closing Disclosure, and the settlement statement.
- A blank amount or $0.00 clears the adjustment. A value that is not an amount stays on the screen and says how to type it.
- Saving the description first and the amount second still lowers the total. That second save used to add the $1,200.00.

**What's still missing**

- Not checked on TEST. Do not mark Live before someone saves -$1,200 on Escrow line 08 and sees the total go down. The line already saved on TEST stays as it is until it is saved again.
- Other fee lines still do not take a minus sign.

**Links**

- Spec: [docs/specs/aggregate-adjustment.md](docs/specs/aggregate-adjustment.md)

**Decisions**

- No database file. The line was already allowed to lower the total. The save was not marking it that way.
- A positive amount on line 08 lowers the total too. That is the line for the aggregate adjustment.

## Settlement and disbursement dates on File Overview (FF-097)

**How it should work.** At the top of a file, next to the settlement date, staff who can edit the file can change that date and the disbursement date. The settlement date saves on the file, stays after a reload, and is the date tasks, Scheduling Details, Accounting, and prorations already use. Agents, buyers, and sellers see the dates and cannot change them. A buyer's "+ Propose a closing time" still does not write the file date.

**Status: In progress.** Tracker FF-097. Francis Santos, Nov 17 2026, 2:31 PM ET (Gmail message 1a1eafe6e1a32dde), signed in as Processor 2. Pull request: [PR 328](https://github.com/Johncoester/cla-portal-demo/pull/328). No database file. Not Live until someone checks it on TEST.

**What's built**

- The file header shows Settlement date and Disbursement date side by side. A processor, a pre-processor, or an admin gets a date field. Other roles, and demo view, see text.
- Saving writes the existing closing date and disbursement date. A blank disbursement date stays automatic.
- Tasks, Scheduling Details, Accounting, and prorations read that same closing date.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- John's later change, locking the file date when a buyer proposes a closing time, is not built here.

**Links**

- Spec: [docs/specs/file-overview-dates.md](docs/specs/file-overview-dates.md)
- Pull request: [PR 328](https://github.com/Johncoester/cla-portal-demo/pull/328)

**Decisions**

- No database change. TEST already lets staff who can edit the file update `closing_date`. The scheduling guard does not block that column.
- The disbursement date uses the existing column. Blank means the automatic date.

## File Overview layout (FF-105)

**How it should work.** On the staff File Overview, the blue tasks bar stays above a row of four boxes (Transaction Type, Open Date, Close Date, Purchase Price) and a Closing Team row. Each Closing Team card shows initials, the person's name, then the role: Processor, Transaction Coordinator, Licensed Settlement Agent, and Sales Person. A missing person leaves the name blank. Parties is one compact list in the picture's order: Buyer, Seller, Lender, Loan Officer (only when that name is already on the lender contact), Selling Agency, Selling Agent, Selling Agent TC, Listing Agency, Listing Agent, Listing Agent TC, Title Abstractor, and Underwriter. Processor, Title Company, the sales rep, Preprocessor, and anyone else already on the file stay under that list. Call, Email, copy, Source of business, All contacts, Notes, Automation, and Configuration stay. Closer stays Closer. Buyers, sellers, and agents do not get this staff layout.

**Status: In progress.** Tracker FF-105. Francis Santos, email Nov 19 2026, 12:23 PM ET ("File Overview – UI Layout Rearrangement Only"), image Order Parties Updated.png. She confirmed the layout on Nov 19 2026, 2:35 PM ET (Gmail 1a1f54e71ce7e8b6). Pull request: [PR 375](https://github.com/Johncoester/cla-portal-demo/pull/375). No database file. Not Live until someone checks it on TEST.

**What's built**

- Staff File Overview shows the four boxes (value, then the label) and the Closing Team cards (initials, name, then the role).
- Parties follows the picture's order and labels. Selling Agent, Selling Agent TC, Listing Agent TC, and Title Abstractor are display words. The stored roles stay Buyer Agent, Buyer Agent TC, Listing Agent TC, and Abstractor.
- A Loan Officer row appears only when the lender contact is already a loan officer.
- Processor, Title Company, sales rep, Preprocessor, Notes, Automation, and the existing buttons stay.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- Licensed Settlement Agent has no saved field, so the card title shows and the name stays blank. Closer is unchanged.
- The staff tracker shows "Wire/Cash to Close Acknowledge" and "Funding Auth". Reports and the database still use the old stage names.

**Links**

- Spec: [docs/specs/file-overview-layout.md](docs/specs/file-overview-layout.md)
- Pull request: [PR 375](https://github.com/Johncoester/cla-portal-demo/pull/375)

**Decisions**

- Layout only. No new database column and no removed field.
- Licensed Settlement Agent is not the Closer.
- A blank name means nobody is assigned. The role title stays.
- More than one salesperson means more than one Sales Person card.

## CRM report grouping without fiscal buckets

**How it should work.** On a CRM report and on a CRM chart, date grouping offers By Day, By Calendar Week, By Month, By Quarter, and By Year. By Fiscal Week, By Fiscal Quarter, and By Fiscal Year are not in the list. A report or chart already saved with one of those opens as the matching calendar grouping: fiscal week as week, fiscal quarter as quarter, and fiscal year as year. It does not show an error.

**Status: In progress.** Janine Santos said "We can remove fiscal for now." Pull request: [PR 333](https://github.com/Johncoester/cla-portal-demo/pull/333). No database file. Not Live until someone checks a report and a chart on TEST.

**What's built**

- The grouping list on reports and charts no longer includes the three fiscal choices.
- Opening a saved report or chart that still has one of those codes uses the matching calendar grouping.
- Saving a report or chart that still sends one of those codes stores the calendar grouping.
- Date filters say Previous Year, Current Year, and Next Year. A saved filter or view that still uses the old FY choice loads as that year choice.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- This Year stays on the date list. It covers the same calendar year as Current Year.

**Links**

- Spec: [docs/specs/crm-report-grouping.md](docs/specs/crm-report-grouping.md)
- Pull request: [PR 333](https://github.com/Johncoester/cla-portal-demo/pull/333)

**Decisions**

- No database change. Old saved values stay stored and are read as the calendar grouping.
- The closing-cost calculator's Maryland property-tax note is not a CRM screen and is unchanged.

---

## CRM Home My Tasks (Feedback 29 item 4)

**How it should work.** On CRM Home, every task view (Open, Overdue, Closed, Today + Overdue, and the rest of that menu) shows only tasks assigned to the person who is signed in. An admin sees only their own tasks here too. Admins will later get separate Tasks, Meetings, and Calls modules. Those are not part of this change.

**Status: In progress.** Janine confirmed this on Nov 16 2026, CRM Feedback 29 item 4. Pull request: [PR 336](https://github.com/Johncoester/cla-portal-demo/pull/336). No database file. Not Live until someone checks CRM Home on TEST.

**What's built**

- CRM Home asks for tasks assigned to the signed-in person. The owner filter is on that read, on the owner column that is already indexed.
- Every choice in the Home task menu uses that list, so each one is only that person's tasks.
- Previous and Next on a task opened from Home stay on that person's tasks when the browser has not kept the list order.
- Dashboards that list every visible task are unchanged.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- Separate Tasks, Meetings, and Calls modules for admins are not built.

**Links**

- Spec: [docs/specs/crm-home-my-tasks.md](docs/specs/crm-home-my-tasks.md)
- Pull request: [PR 336](https://github.com/Johncoester/cla-portal-demo/pull/336)

**Decisions**

- No database change. The existing owner index is enough.
- The filter is the same for every CRM user, including an admin and a processor.
- Reports and dashboards still load the tasks that person is allowed to see. Only the Home task list is limited to the assignee.

## CRM record shortcuts (Feedback 28 item 3)

**How it should work.** On a Lead, Client, Deal, or Company, a panel on the left starts with Clients, Leads, Deals, Task, Meeting, Call. Janine set that order on Nov 18 2026, 5:23 PM ET. If the record already has that section, a click moves down the page to it. If it does not, the shortcut opens that module's list. After those six, Notes, Open Activities, Closed Activities, Emails, and Attachments stay in that order, and only when that section is already on the record. On a wide screen the panel stays put while the record scrolls. On a narrow screen the shortcuts wrap across the top.

**Status: In progress.** Janine, CRM Feedback 28 item 3, confirmed Nov 16 2026. The first panel was [PR 337](https://github.com/Johncoester/cla-portal-demo/pull/337), merged as 3212c332. The Nov 18 order is [PR 360](https://github.com/Johncoester/cla-portal-demo/pull/360). Call on a deal opens the Calls list in [PR 368](https://github.com/Johncoester/cla-portal-demo/pull/368). No database file. Not Live until someone checks a record on TEST.

**What's built**

- The panel on Lead, Client, Company, and Deal records.
- The first six are always Clients, Leads, Deals, Task, Meeting, Call.
- Clients scrolls to the company's client list. Deals scrolls to the orders already on a client or company. Task, Meeting, and Call scroll to Open Tasks, Open Meetings, and Open Calls when those columns are on the record.
- A lead has no clients, leads, or deals section, so those three open the Clients, Leads, and Deals lists. A deal has none of the six sections. Task opens CRM Home (My Open Tasks). Clients, Leads, and Deals open their lists. Call on a deal opens the Calls list. Meeting on a deal stays grey text, "Coming soon".
- Notes, Open Activities, Closed Activities, Emails, and Attachments follow, in that order, only when the section is on the page. A deal still shows Emails and leaves the other four off.
- The lists of leads, clients, companies, and deals do not get the panel.
- The panel does not load anything extra.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- The orders card still says Orders in the portal. The shortcut that jumps there says Deals.
- There is no Meetings list. On a Deal, Meeting stays grey "Coming soon" text. Call opens the Calls list. That list has no way to show only one deal's calls, so the list is every call this person can already see.

**Links**

- Spec: [docs/specs/crm-record-shortcuts.md](docs/specs/crm-record-shortcuts.md)
- First panel: [PR 337](https://github.com/Johncoester/cla-portal-demo/pull/337)
- Order change: [PR 360](https://github.com/Johncoester/cla-portal-demo/pull/360)
- Call opens the Calls list: [PR 368](https://github.com/Johncoester/cla-portal-demo/pull/368)

**Decisions**

- No database change. The panel does not add rows. It points at a section already on the record, or at the module's existing list.
- Call on a deal opens `#/crm/calls`. The Calls list does not read a deal filter, so the shortcut does not invent one. Meeting stays unlinked until a Meetings list exists.
- The older shortcuts stay after the six, in the same order they had before Deals moved up.

---

## CRM task profile link (Feedback 29 item 6)

**How it should work.** On a CRM task, the page shows the lead or client that task belongs to. The name is a link back to that profile. The same page opens from Home and from Open Activities on a record.

**Status: In progress.** Janine confirmed this on Nov 16 2026, CRM Feedback 29 item 6. Pull request: [PR 339](https://github.com/Johncoester/cla-portal-demo/pull/339). No database file. Not Live until someone checks a task on TEST.

**What's built**

- A task on a lead shows that lead's name and links to the lead.
- A task on a client shows that client's name and links to the client.
- The name comes from the task when it is already there. Otherwise one read by that record's id fills it in.
- If the name cannot be read, the task still opens and says where to look. A company task does not invent a person.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- The Home Related To and Contact Name columns are a separate item.

**Links**

- Spec: [docs/specs/crm-task-profile.md](docs/specs/crm-task-profile.md)
- Pull request: [PR 339](https://github.com/Johncoester/cla-portal-demo/pull/339)

**Decisions**

- No database change. The task already stores the record it belongs to.
- The link is built from that record id. A stored web address on the task is not used as the profile link.

---

## CRM Home task names (Feedback 29 item 5)

**How it should work.** On CRM Home, Related To and Contact Name show the lead or client the task was created under. Intro Call shows Marcus Vance. Each name is a link that opens that lead or client profile. A task that is not under a lead or a client leaves both columns blank, and the rest of the list still shows.

**Status: In progress.** Janine confirmed this on Nov 16 2026, CRM Feedback 29 item 5. Pull request: [PR 340](https://github.com/Johncoester/cla-portal-demo/pull/340). No database file. Not Live until someone checks CRM Home on TEST.

**What's built**

- Home asks for the signed-in person's tasks, then asks once for the names of the leads on that list and once for the clients on that list.
- Both columns show that name, and each name opens the lead or client profile.
- A name the read does not return stays blank. The task list still opens.
- Tasks under a company or an opportunity are unchanged.
- Opening one task still uses that task's own name read.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.

**Links**

- Spec: [docs/specs/crm-home-task-names.md](docs/specs/crm-home-task-names.md)
- Pull request: [PR 340](https://github.com/Johncoester/cla-portal-demo/pull/340)

**Decisions**

- No database change. The task already stores the lead or client id. That id is not a foreign key, so the name cannot be embedded in the task read.
- A list that is only leads, or only clients, uses one extra read. A list with both uses one read for each table. It never reads once per task.
- Janine later asked to drop the Related To column. That follow-up is the next section. It is not part of PR 340.

---

## CRM Home My Tasks drops Related To (Feedback 29 follow-up)

**How it should work.** On CRM Home, My Tasks no longer has a Related To column. Contact Name is the name of the record the task belongs to, and it is a link. A lead opens that lead. A client opens that client. A company opens that company. A deal opens that deal, using the property address as the name. Due Date, Subject, Status, Priority, and Edit stay as they are. A task with no name still shows, with a blank Contact Name. The task page itself still has Related To.

**Status: In progress.** Janine Santos, Nov 18 2026, asked to remove Related To because it showed the same information as Contact Name, as long as Contact Name shows for tasks from every module. She confirmed on Nov 19 2026, 6:28 PM ET, with "Feedback 29 - Home tab tasks: Yes." No database file. Not Live until someone checks CRM Home on TEST.

**What's built**

- The Home task list no longer has Related To. The other columns on that list are unchanged.
- Contact Name links to the lead, client, company, or deal.
- The list asks once for each of those tables that the list actually uses. It does not ask once per task.
- A name the read does not return stays blank, and the rest of the list still shows.
- Opening one task is unchanged. That page still shows Related To.

**What's still missing**

- Not checked on TEST yet. Do not mark Live before that.
- A task under a pipeline opportunity still has a blank Contact Name. An opportunity does not have its own page.

**Links**

- Spec: [docs/specs/crm-home-tasks-related-to.md](docs/specs/crm-home-tasks-related-to.md)
- Pull request: [PR 383](https://github.com/Johncoester/cla-portal-demo/pull/383)

**Decisions**

- No database change. The task already stores which record it belongs to.
- The deal name is the property address, the same name the deal page uses.
- Related To stays on the task page. Only the Home list drops that column.

---

## Add dashboard charts to CRM Home (Feedback 31 item 1)
## Clone a CRM dashboard copies its charts
## CRM Calls menu link (Feedback 32 item 3)

**How it should work.** Each chart on a CRM dashboard has Add to Home. The chart then shows on that person's CRM Home, with Refresh, Rename, and Remove. Dragging changes the order on Home. Rename and Remove do not change the chart on the dashboard. Remove only takes it off Home. There is no resize. Each person has their own Home charts.
**How it should work.** Clone on a CRM dashboard makes a new dashboard named like "Lead dashboard (copy)". Every chart comes with it: the same settings, filters, order, and size. The original dashboard stays as it was. A hidden chart is not copied. The copy is Only me.
**How it should work.** Calls in the CRM menu opens a list of calls already saved on a lead, client, or company. The subject opens that call. If there are no calls, the page says so. It is not the full Calls module.

**Status: In progress.** Janine confirmed this on Nov 18 2026, CRM Feedback 31 item 1. Pull request: [PR 359](https://github.com/Johncoester/cla-portal-demo/pull/359). A database file is included and has not been applied. Not Live until the lead applies it on TEST and someone checks Home there. Not merged.
**Status: In progress.** Janine confirmed this on Nov 18 2026, CRM Feedback 31 item 2. Pull request: [PR 357](https://github.com/Johncoester/cla-portal-demo/pull/357). No database file. Not Live until someone checks Clone on TEST.
**Status: In progress.** Janine, CRM Feedback 32 item 3, confirmed Nov 18 2026. Pull request: [PR 356](https://github.com/Johncoester/cla-portal-demo/pull/356). No database file. Not Live until someone checks Calls on TEST.

**What's built**

- Add to Home on every chart of a dashboard the person can open.
- Home shows those charts after the rest of the page, with Refresh, Rename, Remove, and drag to reorder.
- The Home name and the Home order are stored for that person only. The dashboard chart is unchanged.
- If the person has no Home charts, Home does not ask again during that browser tab, and it does not load chart numbers.
- If the database file is not applied yet, Add to Home is hidden.
- Clone suggests "<name> (copy)" and saves that name, shortened so it still ends with " (copy)" when the original name is already at the 100-character limit.
- Every visible chart is copied in one save: name, type, module, measure, grouping, filters, width, height, and order.
- The dashboard's own owner and period filters are copied, so the charts match.
- A retired chart stays on the original only.
- A blank name is refused and nothing is saved.
- Calls in the CRM menu opens the list instead of saying the page does not exist.
- The list is one read of the calls already stored. Newer calls are first. Each subject opens the call that was already there.
- A missing call says it was not found and goes back to the list. A processor can see the list.
- The other CRM menu links still open their pages.

**What's still missing**

- The database file is not applied on TEST. Do not mark Live before that, and not before someone checks it there.
- Resizing was asked not to be built.
- Not checked on TEST yet. Do not mark Live before that.
- Scheduling, logging, and completing calls from this list are later, with the Calls, Meetings, and Tasks modules.

**Links**

- Spec: [docs/specs/crm-home-charts.md](docs/specs/crm-home-charts.md)
- Pull request: [PR 359](https://github.com/Johncoester/cla-portal-demo/pull/359)
- Spec: [docs/specs/crm-dashboard-clone.md](docs/specs/crm-dashboard-clone.md)
- Pull request: [PR 357](https://github.com/Johncoester/cla-portal-demo/pull/357)
- Spec: [docs/specs/crm-calls-menu.md](docs/specs/crm-calls-menu.md)
- Pull request: [PR 356](https://github.com/Johncoester/cla-portal-demo/pull/356)

**Decisions**

- List column preferences cannot hold this. Those rows are only the lead, client, company, and deal lists. A new table stores the chart id, the Home name, and the order.
- The file is not applied by this change.
- No database change. Charts already store their settings on the dashboard. The copy writes those rows in one batch.
- The copy is Only me. Sharing on the original is not copied.
- A hidden chart is not copied. Restore it on the original first if it should be included.
- No database change. The list uses the calls already stored. It does not add a table or a query.
- The full Calls module is not part of this change. The menu opens the short list so the link is not a dead end.

---

## Document folders (FF-104)

**How it should work.** On an order, Documents keeps All files, Received, and Sent. A fourth tab, Folders, lists that order's folders and how many files are in each one. CLA staff can add a folder and move a document into a folder. Buyers, sellers, and agents do not see the tab. A new closing order gets eight folders (100 Processing through 700 Recorded Documents and Policies) instead of the five older names. Orders that already exist keep the folders and files they have.

**Status: In progress.** FF-104a (the Folders tab) is [PR 376](https://github.com/Johncoester/cla-portal-demo/pull/376). FF-104b (the eight folders on new orders) is [PR 377](https://github.com/Johncoester/cla-portal-demo/pull/377). The database file is not applied on TEST. Not Live.

**What's built**

- FF-104a: the Folders tab, the file count, Add folder, and Move, for Processor, Preprocessor, Transaction Coordinator, Admin, and Super admin. Sales can open the tab and see the counts. They cannot add or move.
- FF-104b: a new closing order gets the eight folders. An order that already exists keeps the folders it has. Title does not add a second copy of a folder name the order already has. "450 Final Closing Documents" and Title's "450 Prior Closing Documents" are both kept.

**What's still missing**

- Apply `supabase/migrations/20261125350000_order_default_folders.sql` on TEST. Do not mark Live before that, and not before someone checks a new order there.
- Master Template Library, Generate, Search Packages, a Word editor, Download Word, Download PDF, the Merge / Delete / Rename / Refresh / Download / Print / Send / eSign toolbar, and Drafts. John has not decided the eSign provider, the Word editor, or Delete / retention.
- A photo-ID upload on a new order no longer has an "IDs & personal" folder, so it is filed as Unfiled. Older orders still have that folder.

**Links**

- Spec: [docs/specs/document-folders.md](docs/specs/document-folders.md)
- Pull request: [PR 376](https://github.com/Johncoester/cla-portal-demo/pull/376) (FF-104a) and [PR 377](https://github.com/Johncoester/cla-portal-demo/pull/377) (FF-104b)
- Source: Francis Santos, Nov 19 2026, 1:15 PM ET, confirmed Nov 19 2026, 2:35 PM ET (Gmail 1a1f54e71ce7e8b6). Tracker FF-104a and FF-104b.

**Decisions**

- Phase 1 is the tab, then the default folders. Nothing else from the picture is built in this phase.
- The Title module keeps its own extra folder names. "450 Final Closing Documents" and "450 Prior Closing Documents" are different folders.

---

## CRM Companies column sort (Feedback 30 follow-up item 1)

**How it should work.** On CRM, then Companies, each column header sorts the All Companies list. The first click sorts up. The second click sorts down. The same arrow used on Leads, Clients, and Deals shows the direction. Search, filters, and pages stay in effect.

**Status: In progress.** Janine Santos, Feedback 30 follow-up item 1, confirmed by email Nov 19 2026, 6:30 PM ET ("Yes"). Pull request: [PR 384](https://github.com/Johncoester/cla-portal-demo/pull/384). No database file. Not Live until this is merged and someone checks it on TEST.

**What's built**

- Companies uses the same header sort as Leads and Clients. The Sort menu is no longer on that list.
- The list still opens on Company Name, A to Z. A sort already saved on the login is kept.
- Search, Company Owner, Type, Archived, and the three time filters limit which companies are sorted. The next page continues that order.
- Blank city, owner, and times stay at the bottom. Clients, Orders, and Volume sort as amounts.

**What's still missing**

- A check on TEST after merge. Do not mark Live before that.

**Links**

- Spec: [docs/specs/crm-companies-sort.md](docs/specs/crm-companies-sort.md)
- Pull request: [PR 384](https://github.com/Johncoester/cla-portal-demo/pull/384)

**Decisions**

- No database file. The company list is already loaded, then sorted in the browser, the same way Leads and Clients sort after their list is loaded.
- Cache stamp 202611249800, so a saved copy of the Companies page is not reused.

