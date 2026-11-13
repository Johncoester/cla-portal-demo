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

**Status: Partial (being built as AF-1 to AF-6).**

| Step | What | Status |
|---|---|---|
| AF-1 | Fee records and change history (database only) | Live on TEST, [PR 225](https://github.com/Johncoester/cla-portal-demo/pull/225) |
| AF-2 | Staff entry and agent view; buyers and sellers can't see fees | Live on TEST, [PR 227](https://github.com/Johncoester/cla-portal-demo/pull/227) |
| AF-3 | Agent or TC changes: "You're changing X from $A to $B", "Agent confirmed", notices to staff | Live on TEST, [PR 235](https://github.com/Johncoester/cla-portal-demo/pull/235) |
| AF-4 | Notice to the agent when staff change a confirmed fee | Live on TEST, [PR 236](https://github.com/Johncoester/cla-portal-demo/pull/236) |
| AF-5 | Fees post to Accounting automatically | Live on TEST, [PR 237](https://github.com/Johncoester/cla-portal-demo/pull/237) |
| AF-6 | "Generate CD" and "Generate ALTA" PDF buttons | Live on TEST, [PR 238](https://github.com/Johncoester/cla-portal-demo/pull/238) |

**What's built**

- AF-1 (database only, nothing on screen yet): each file keeps, per agent side, a commission (% and $ always in step with the sales price), an admin fee with who pays it, and up to 5 other fees. Each fee records whether staff, the agent or a TC set it, and who confirmed it and when. A history keeps who, when, old value, new value, reason and source. Staff can't change a fee the agent or TC confirmed without a reason. When the sales price changes, each commission is worked out again and the change goes in the history.
- AF-2: an **Agent fees** box on the file overview. Processors (and pre-processors on their files, and admins) see both agent sides and can edit them; other CLA staff on the file see them read only; each agent sees and edits only their own side; buyers and sellers never see it. In the edit window, typing the commission % fills in the $ (or the other way round) from the sales price. Admin fee with Paid by, up to 5 other fees (description, amount, paid to, paid by). When the agent confirmed the side, staff must type a reason before saving. A "Change history" button lists every change (when, who, was, now, reason). The box shows "Not confirmed by the agent yet", "Agent confirmed", "Confirmed by TC", or "Agent confirmed, then changed by CLA staff".
- AF-3: when an agent (or a TC for the agent) saves, they first see "You're changing … from $A to $B" (or "You're confirming these fees as they are"), with "Yes, save and confirm" and "Go back" (which keeps what they typed). Saving marks the side "Agent confirmed" or "Confirmed by TC". The TC's own overview now has the Agent fees box. When an agent or TC changes or confirms fees, the file's processor, pre-processor and TC get a portal notice (who, the file, old and new values) and an email is queued for each. When a TC confirms, the side's agent is told too.
- AF-4: when CLA staff change fees the agent (or TC) confirmed, the side's agent gets a portal notice and a queued email: who changed it (marked "CLA Title"), old and new values, and the reason. It says no re-approval is needed. Nobody else is told, and nothing is sent when staff change fees nobody has confirmed yet.
- AF-5: every agent fee posts to the file's Accounting fee ledger by itself. Each fee is one line under ALTA "Commission" and CD section H, paid by the fee's payer. The payee is the agent's company (or "Buyer's Agent" / "Listing Agent" when it has none), or the other fee's "paid to". A line is kept in step when the fee or the sales price changes, and retired (never deleted) when the fee is removed. If a processor changes the line by hand on the Accounting tab, automatic posting leaves it alone from then on.
- AF-6: Accounting's Closing Disclosure and Settlement Statement tabs stay, and each has a **Generate CD** / **Generate ALTA** button. It opens the print window with the file's document name filled in (for example "MD-26-97262 - Closing Disclosure - TEST") so it can be saved as a PDF. The agent fees appear in CD section H and the ALTA "Commission" section.
- AF-2 also hides the commission figures in the overview's "Earnest & commissions" box from buyers and sellers. They see only "EMD held by", under "Earnest money".
- Staff can enter commission base, percent, any additional amount and who pays it (buyer or seller) on Place Order, in Edit order details, and in Accounting > Contract figures. All three use the same figures.
- Agents have a "Confirm Your Transaction Information" task where they enter their commission split and any fees or credits. Every version they submit is kept, and the file's processor gets an in-portal notice when they submit or revise it.
- The Accounting fee ledger already has a "Commission" section that shows on the CD (section H, "Other") and on the settlement statement.
- The portal has an in-portal notifications list, and Accounting fee changes are already logged.

**What's still missing**

- The older commission boxes (Place Order "Earnest & Commissions", Edit order details, Accounting > Contract figures, the TC's contract figures) still save to the order's old commission fields and don't feed the Agent fees box. John to decide: remove them, or have them fill the Agent fees box.
- The agent's "Confirm Your Transaction Information" task isn't pre-filled from the Agent fees box yet; the agent confirms fees in the box instead.
- Notice emails are queued in the portal's outbox but never sent on TEST (the TEST portal sends no email). Sending them needs the production mail switch, which is John's call.
- The order's old commission fields can still be read by buyers and sellers through the database (the new Agent fees records can't). They're blank on every TEST file today.
- A sales price change re-posts the commission in the database (TEST); the demo (mock) portal re-posts only when the fees are saved.
- "Generate CD" and "Generate ALTA" make the PDF with the browser's own "Save as PDF". The portal doesn't store the PDF on the file.
- No end-to-end test covers this flow.

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
- AF-1 choices (simplest option; tell John if any is wrong): a commission can't be saved until the file has a sales price, so % and $ can always be checked against it. The commission and other fees also record who pays them, with the same defaults as the admin fee (buyer for the buyer's agent, seller for the listing agent). When staff change a confirmed fee, the record of who confirmed it stays, so every later staff change still needs a reason. A fixed-$ commission bigger than a new, lower sales price switches to keeping its %. A TC can confirm the side of an agent on their team; the file's own TC can confirm either side. A refinance has no agent fees.

---

## CD / ALTA generation

**How it should work.** The Closing Disclosure (CD) and the ALTA settlement statement are built from the file's Accounting fee ledger, so every fee is entered once and lands in the right section of both documents.

**Status: Partial.**

**What's built**

- A file's Accounting tab has two live views, **Closing Disclosure** (pages 1-5) and **Settlement Statement**. Both are built from the fee ledger whenever they're opened, and both can be printed.
- Every ledger line has a CD section and an ALTA section. A commission line goes to CD section H ("Other") and to the ALTA "Commission" section.
- CD page 5 lists the buyer's and seller's real estate brokers from the file's agents.

**What's still missing**

- There are no "Generate CD" or "Generate ALTA" buttons yet. John decided (Nov 12) to keep the live tabs and add these buttons to create a PDF.
- Agent fees don't reach the ledger automatically yet (see Agent fees flow), so they won't appear on either document until someone adds them by hand.

**Links**

- Spec: none yet. The agent fees parts are in [docs/specs/agent-fees-flow.md](docs/specs/agent-fees-flow.md) (requirement 5).
- Related pull requests: none on record. The CD and Settlement Statement views were built before the repo's current pull request history.

**Decisions**

- One fee ledger feeds both the CD and the settlement statement. Nothing is entered twice.
- Keep the live Closing Disclosure and Settlement Statement tabs (view and print), and add "Generate CD" and "Generate ALTA" buttons that create a PDF (John, Nov 12).

---

## Buyer and seller invites and sign-in

**How it should work.** Staff invite a buyer or seller from a file. The person opens the invite email, sets a password once and lands in the portal. If they forget the password, Forgot password emails them a reset link that opens the TEST portal.

**Status: Partial.**

**What's built**

- Buyer, seller and agent invites from a file's Contacts tab, with an automatic invite email ([PR 95](https://github.com/Johncoester/cla-portal-demo/pull/95), [PR 140](https://github.com/Johncoester/cla-portal-demo/pull/140)).
- FF-073a (Janine's buyer recordings, Nov 12): accepting an invite twice (double-click or a second tab) can no longer delete the login. Only a login made in that same request that never became a portal user is cleaned up.
- FF-073b: the Forgot password email's link opens the portal the person is using (testportal.clatitle.com on TEST), not the old GitHub address.

**What's still missing**

- The TEST Auth "Redirect URLs" list must include https://testportal.clatitle.com/ for the reset link to land there; if it doesn't, Auth falls back to its Site URL. John checks that setting.
- FF-073c to FF-073e (waiting on Janine): a clear "invite already used" message, the property address in the invite email, and a new invite when a buyer's email changes.

**Links**

- Spec: none yet.
- Related pull requests: [PR 95](https://github.com/Johncoester/cla-portal-demo/pull/95), [PR 140](https://github.com/Johncoester/cla-portal-demo/pull/140), [PR 219](https://github.com/Johncoester/cla-portal-demo/pull/219) (FF-073a), [PR 220](https://github.com/Johncoester/cla-portal-demo/pull/220) (FF-073b).

**Decisions**

- accept-invite never deletes an existing or just-claimed login (John, Nov 12, 6:09 PM ET).
- The reset link uses the current portal address; the Auth redirect list is John's setting, not changed by a pull request.

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
- Walkthrough cleanup (Nov 13): after each run, the test conversations and test orders the walkthrough created are actually deleted again. Until now they piled up on TEST (451 conversations and 95 orders) because the cleanup deleted them in the wrong order. No change to what the team sees.
- Walkthrough recordings (Nov 13): when a walkthrough test fails, the step-by-step recording it saves no longer contains the test accounts' email addresses or passwords. Recording pauses while a test signs in. No change to what the team sees.
- FF-071c (#23): the file overview shows the Disbursement date: for a refinance, the 4th business day after closing (rescission rule: Saturdays count, Sundays and federal holidays don't); for a purchase, the closing date. The processor can type a different date in Edit order details; clearing it goes back to the automatic date.
- FF-072 / FF-054b (#24): in a file's email (To, Cc, Bcc), "Start a conversation" and Share files, the people offered are only that file's parties and the CLA staff on it; the browser's saved-address suggestions are off for those boxes. Any address can still be typed.
- FF-011b (street address lookup): on task forms with an address (for example the forwarding address or a mailed proceeds check), typing a full street line such as "12 Main St, Rockville, MD 20850" fills the empty City, State and ZIP boxes.

**What's still missing**

- On hold: #1, #2, #4, #5, #10, #13, #15, #16, citizenship, spouse marital status, entity documents required, phone and email icons with no app.

**Links**

- Spec: none yet. Source: Janine's video Nov 12 2:57 PM ET; Francis Feedback tickets FF-063 to FF-072.
- Related pull requests: [PR 221](https://github.com/Johncoester/cla-portal-demo/pull/221) (FF-071b), [PR 222](https://github.com/Johncoester/cla-portal-demo/pull/222) (FF-064/065), [PR 223](https://github.com/Johncoester/cla-portal-demo/pull/223) (FF-070), [PR 224](https://github.com/Johncoester/cla-portal-demo/pull/224) (FF-063), [PR 226](https://github.com/Johncoester/cla-portal-demo/pull/226) (FF-070b speed fix), [PR 228](https://github.com/Johncoester/cla-portal-demo/pull/228) (FF-069d), [PR 229](https://github.com/Johncoester/cla-portal-demo/pull/229) (FF-063c), [PR 230](https://github.com/Johncoester/cla-portal-demo/pull/230) (FF-066), [PR 231](https://github.com/Johncoester/cla-portal-demo/pull/231) (FF-067), [PR 232](https://github.com/Johncoester/cla-portal-demo/pull/232) (FF-068), [PR 233](https://github.com/Johncoester/cla-portal-demo/pull/233) (FF-069b), [PR 234](https://github.com/Johncoester/cla-portal-demo/pull/234) (FF-071a), [PR 239](https://github.com/Johncoester/cla-portal-demo/pull/239) (FF-071c), [PR 240](https://github.com/Johncoester/cla-portal-demo/pull/240) (FF-072/FF-054b), [PR 241](https://github.com/Johncoester/cla-portal-demo/pull/241) (FF-011b), walkthrough fix for FF-069d ([PR 242](https://github.com/Johncoester/cla-portal-demo/pull/242)), Documents newest-first fix ([PR 244](https://github.com/Johncoester/cla-portal-demo/pull/244)), walkthrough cleanup order ([PR 245](https://github.com/Johncoester/cla-portal-demo/pull/245)), walkthrough recordings without passwords (this change).

**Decisions**

- John approved fixing the bugs without waiting (Nov 12, 6:08 PM ET); Francis confirmed the rest on Nov 12, 6:14 PM ET.

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
