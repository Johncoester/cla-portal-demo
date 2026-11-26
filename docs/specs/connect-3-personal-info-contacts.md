# Personal Information answers on the Contacts tab (CONNECT-3)

Asked by John Coester, Nov 25 2026, 7:49 PM ET (t2081u), from the team's Connect Live Test Checklist, rows 7.3 and 7.7 (Francis, Nov 25 2026):
"When the buyer [seller] completes the Personal Information task, the buyer's [seller's] and spouse's information appears only in the
Buyer [Seller] Tasks section and does not populate in the Contact section." Row 7.7's expected result: "Client edits their phone or email:
goes to staff for approval; doesn't quietly overwrite the record."

## How it works

- Order > Contacts, for staff who run orders (processor, coordinator, admin), gets a **From Personal Information** section under the
  contacts table: one card per buyer and seller who has saved their Personal Information task.
- Each card shows what they entered: entity name and signer (for an entity), current address, marital status, citizenship, forwarding
  address (sellers), power of attorney, and their **spouse** (name, marital status, citizenship, phone, email). The spouse SSN is never shown here.
- If the form's name or phone differs from the contact, the card says **Answers differ from the contact**. **Review answers** lists each
  difference side by side. A contact field that is blank starts ticked; a field that already has a different value starts unticked, so
  staff approve every overwrite (row 7.7). **Save to contact** updates the contact with the existing contact save, so the new name flows to
  every screen that reads the party's name (Parties, file title, title and deed screens).
- The email is never copied from here. It is the address portal emails and the sign-in use, so a different email on the form is shown with a
  note to change it with Edit (which already re-sends the invite when the email changes).
- The client's own save never writes the contact.

## Not done

- Address, marital status, citizenship and the spouse have no field on the contact record, so they are shown on the card, not copied.
  The title team still types vesting and deed wording; nothing fills vesting text automatically.
- No automatic copy without a staff click (row 7.7 asks for staff approval). If the team wants blank fields filled automatically when the
  client finishes the task, that needs a database change and a rule 27 review.

## Files

- Pull request: [PR 451](https://github.com/Johncoester/cla-portal-demo/pull/451)
- `js/data/personal-info-contact.js` (what to show and what can be copied), `js/pages/dealcontacts.js` (section and Review answers)
- Test: `test/test-connect-3-personal-info-contact.js`
- No database file.
