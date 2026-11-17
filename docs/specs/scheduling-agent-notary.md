# Settlement agent/notary (MF-058)

Source: Matt Landsberg's Gemini notes "Processor User-Scheduling Details Nov 17 Feedback" (Gmail 1a1e9eab7014ec5f). Matt confirmed the numbered list on Nov 17 2026, 10:30 AM ET. Tracker row MF-058. Builds on MF-056 (Scheduling Details, PR 302).

## What the processor sees

On Scheduling Details:

1. Buyer side: the settlement agent/notary block is under the buyer summary, and that block is the larger one.
2. Seller side: the settlement agent/notary block is inside the seller section.
3. The label is **settlement agent/notary**. Database column names are unchanged.
4. Phone, email and Confirmed are on each side. Confirmed sits next to that side's settlement agent/notary.
5. The fields save on their own after a short pause. Saved, or a plain error, shows under the fields. A failed save leaves the typing in the boxes. There is no Save button for these fields.
6. The signed-on date is not on this screen. A date already stored is left alone.
7. Send reminder on each side. The buyer side emails the buyers and the buyer's agent. The seller side emails the sellers and the listing agent. The processor sees who it will go to and presses Email these people before anything is sent. Email only.

Processor notes still have their own Save button.

## Decisions

- Confirmed is one checkbox per side.
- Addresses are read from the people already on the file. None are written into the program.
- The outbox row is queued from testportal@clatitle.com, the same portal mailbox as other scheduling mail. TEST's outbox cannot store a sent time, so the row stays queued. The message the person receives is sent through the portal's Gmail send, from the processor's connected mailbox.
- This does not write the file closing date. John's buyer closing-date lock stays held.
- The Closing Disclosure heading "Settlement Agent" and the client line "Your settlement agent: CLA Title & Escrow" stay. Those name the company, not the person on this appointment.

## Database

`supabase/migrations/20261124210000_scheduling_agent_notary.sql` and `supabase/rollbacks/20261124210000_scheduling_agent_notary.sql`. Not applied on TEST by this change. The outbox recipient check is not replaced.
