# A transaction coordinator sees what their agent sees (TC-VIS-1)

John Coester's rule (restated Nov 20 2026, and Nov 21 2026 in chat): a transaction coordinator (TC) sees everything their agent sees on the file. That includes the agent's open and closed tasks, commissions, and other agent fees. A TC is one person who can be on many files and work with several agents.

## What the user sees

- A TC signed in to the portal opens a file where they are the Buyer's transaction coordinator. The file shows the same tabs the buyer's agent has (My Tasks, no general Tasks list).
- My Tasks lists the buyer's agent's tasks, open and done. Each one is marked **your agent**. The TC can open them, see the agent's answers, fill in the agent's forms, and finish the agent's tasks. A finished task says the TC did it on behalf of the agent.
- The Commission and other agent fees for that side show under the buyer's agent tasks, the same as for the agent.
- The listing side works the same way for a Listing transaction coordinator.
- The TC does not see the other side's agent tasks or fees, or the buyer's and seller's own tasks.
- The cross-file My Tasks list includes the agent's tasks on the TC's files too.

## Which agent a TC works for on a file

A TC acts for an agent on a file when either is true:

1. They are on the file as that side's coordinator (Buyer Agent TC or Listing Agent TC), and that side has an agent. This is how TCs are put on files on TEST today.
2. They are linked to the agent (TC-2), and the agent is on the file.

Before this change only the second one counted. On TEST no links exist, so a TC on a file saw nothing of their agent's work.

A CLA staff login with the role Transaction Coordinator already sees every task. For agent fees, that login now also gets the side where they are on the file as that side's coordinator, or linked to that side's agent.

## What this does not change

- Who can open a file, and every other role's tasks and fees.
- Assigning a TC to an agent from the admin screen, the TC's contact, or the file, and putting the TC on all of the agent's files. That is TC-ASSIGN-1.
- Documents and messages.

## Speed

The per-file coordinator check runs once for every file and task in a list. It is now written so Postgres keeps its plan between calls. On a local copy with 1,000 files and 6,000 tasks, an outside user's task list went from about 1.1 seconds to about 0.2 seconds, for agents, buyers and TCs alike. No new page calls.

Source: John Coester, chat, Nov 20-21 2026. Tracker item TC-VIS-1. Rule 9 waived by John for this fix (Nov 21 2026, 11:19 AM ET).
