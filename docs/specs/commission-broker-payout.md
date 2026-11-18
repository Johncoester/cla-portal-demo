# Commission broker fee and payout (FF-101b)

Source: Francis Santos, Nov 18 2026 11 AM Portal review meeting notes. Confirmed by John Coester Nov 18 2026, 2:13 PM ET (Francis Feedback). Tracker row FF-101b.

## What was asked

On the agent's **Commission information** task:

1. A **Broker fee** money field, and a read-only **Total commission** = the side's commission + broker fee.
2. A **payout method**: At settlement, FedEx overnight (mailing address), or Wire (bank name, account name, routing, account number). Mask the account number after save (last 4) for people who are not the agent owner or the processor.

Design the payout fields so a future agent-profile default can prefill them. Do **not** build the profile default yet (John emailed Matt at 11:19 AM; not answered).

## What it does

- Commission ($) on this form is read-only from that side's **Agent fees** commission. That amount already includes any additional amount (base × % + additional). Agents do not type a second commission amount here (AF-8 still applies).
- Broker fee is optional. Total commission updates as commission + broker fee.
- Payout method is required to mark the task complete. FedEx overnight requires street, city, state, ZIP. Wire requires bank name, account name, routing, and account number.
- Account numbers use the same masking path as seller proceeds: the agent and the processor see the full number; other staff (for example a coordinator) see last 4 only.
- Field keys (`payout_method`, `mail_*`, `bank_name`, `account_name`, `routing`, `account`) are stable for a later profile default.

## What is not in this change

- Agent-profile default payout (waiting on Matt).
- Moving the Agent fees box off File Overview into the agent task section (that is FF-101c).
- Applying the database file on TEST (not applied from this pull request).
- Production database or secrets.
