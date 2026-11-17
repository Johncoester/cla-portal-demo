# Scheduling Details (MF-056)

Source: Matt Landsberg, email "Scheduling Feature", Nov 16 2026, 9:20 AM ET (Gmail thread 1a1e4bb28b3e5a7e). Tracker row 316 (MF-056). FF-085 is the same request. Related: MF-010 (nearest office), MF-011 (closer on the file), MF-054 (closing date on the left-column button).

## What the user sees

The file button that said Closing Date now says **Scheduling Details**. Under it, staff and agents still see the file's closing date, time and days remaining, and also each side's chosen settlement date, time and place.

The buyer's agent and the listing agent each get a task, **Schedule the Settlement for [property address]**, with:

1. Ask the buyer (or, on the seller side, the seller) instead, and notify the agent. That queues a scheduling link. Nothing is emailed.
2. Settlement date, starting from the contract or addendum closing date. If the contract has none, the date is blank and required.
3. A CLA office list, starting at the office nearest the property.
4. Or "Settlement Agent/Notary at a different location", with a street address.
5. A time from 9:00 AM to 6:00 PM.
6. Notes.
7. The saved choice shows on the Scheduling Details button.

The seller side is the same, and adds **Prefer a Remote Online Notarization via a computer**.

On the processor's Scheduling Details page: the settlement agent name, a **Settlement Agent Confirmed** checkbox, and a separate **Processor notes** button.

## Decisions

- No contract date: the settlement date stays blank and the person must type one, unless they ask the buyer or seller to schedule.
- Settlement agent list: active staff whose role name contains "Settlement Agent" or "Closer". No portal role matches that today, so the box is free text. A matching role later becomes a dropdown.
- This does not replace MF-011. The Closer field on the file stays. The settlement agent here is only the person named for this appointment.
- The buyer's settlement date is not locked to the file closing date, and saving a side does not change the file closing date. John's lock is held for a later change.
- Links and notices go through the existing outbox. The From address is testportal@clatitle.com. Status stays queued. Nothing is sent.

## Not in this change

The older closing-date request (a few time options each side picks) is still on the page under the new card. Matt can say if that should come off.
