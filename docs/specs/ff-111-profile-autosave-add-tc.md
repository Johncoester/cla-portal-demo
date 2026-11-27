# Agent profile auto-save and add-coordinator step (FF-111)

**Requested by:** Francis Santos. Source: Gemini notes of the Nov 23 2026 2:35 PM ET meeting (Gmail 1a20abbd6b7e823a); confirm-back 1a20af12dc3a104a. Follow-up list Nov 26 (item 8): after saving a profile, should it save on its own and go straight to the add-coordinator screen? Francis Yes, 11:40 AM ET Nov 27, Gmail 1a21de1d2f8fc9d5. Tracker row 459.

**Status:** Building. Not Live until this is merged and Francis checks it on TEST. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

On **My Agent Profile** (a Buyer Agent or Listing Agent):

- The profile saves on its own a moment after a valid change, without clicking Save. A "Saved" note appears next to the button.
- Clicking Save still works. A blank required field (first name, last name, email, or cell phone) stays on the page and tells the person what to fill in.
- The first time an agent lands here after accepting an invite (`?setup=1`, or the one-time onboard flag), Save is labeled "Save and add coordinator" and goes to the add-coordinator section on the same profile (`#/profile?addCoordinator=1`), not Open Orders.
- A later edit stays on the profile.

A Transaction Coordinator, Processor, or other staff login still uses Profile Setting. Saving there stays on that page. This item does not change that form.

## What this does not change

- The add-coordinator form itself (who can be added, validation, and file-side links) is unchanged.
- Staff admin editing of an agent's profile (JC-AGENT-EDIT-1) is unchanged.
- Invite accept still opens `#/profile?setup=1`.
