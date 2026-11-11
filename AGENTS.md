# Permanent rules from John Coester (Nov 11 2026). Reread at the start of every job.

1. When anyone sends a feedback video or meeting notes, do not build anything yet. Reply to the sender, by email, with a numbered list of what you understood: which screen, what is wrong, and what they want instead. Ask them to confirm or correct it. Build only after they say yes.
2. One tracker row and one pull request per item, noting which video or notes it came from.
3. One pull request at a time. Update it onto main, wait for the required checks, merge, then start the next.
4. Mark a tracker item 'Live' only after its database file is applied on TEST.
5. Do not edit a test to make it pass unless you explain why in the pull request.
6. TEST only; never touch production (bxixxgcqxmtzkrolywas) or secrets.
7. Every email sent from jcoester@clatitle.com has a subject starting with '[Written by AI]'.
8. Portal invite emails are sent from testportal@clatitle.com.
9. If the walkthrough on main is failing, fix it before starting any new feature.

## Build standards

10. Every pull request description starts with these four parts, in plain English a non-programmer can read (file names and technical detail go below them, under "Technical notes"):
    - What was asked: who asked, when, and the tracker row.
    - What it does: what the user will see differently, in 2-4 lines.
    - How to test it: numbered clicks on testportal.clatitle.com, which role to log in as, and what they should see. Include one test of what happens when something goes wrong (blank field, bad input).
    - What's not done: known gaps, anything left for later, or "Nothing."
11. Look and behaviour match the rest of the portal: same buttons, colors, spacing, wording and table layout as existing pages. Reuse existing pieces instead of making new ones.
12. Error messages tell the user what went wrong and what to do next, in plain words. Never show a raw error code or a technical message to a client or processor.
13. Nothing half-finished goes live. No buttons, links or menu items that do nothing. If something isn't ready, hide it.
14. Every page works on a phone screen as well as a computer, especially anything a client uses (Place Order, intake, documents, messages).
15. Forms check input before saving (required fields, emails, phone numbers, dates, dollar amounts) and never lose what the user typed if saving fails.
16. Use normal title and escrow terms (buyer, seller, lender, closing date, settlement, payoff) the way CLA's team uses them. If unsure what a term or step means, ask before building.

## Working with Claude

John, Nov 11 2026 (t1510u). Two builders work in this repo: Grok and Claude.

17. Owner. The tracker's Requests tab has an Owner column. Claude owns Documents, Messages, and big self-contained new pages John assigns to Claude (for example the Documents search and sorting, and MF-045). Grok owns Place Order, tasks, invites, walkthrough fixes, and anything that touches shared files (cache stamps, the data adapter, the file header). Urgent items go to Grok, even in Claude's areas.
18. Pull requests. Each builder has at most one open pull request. Merges still happen one at a time, in John's order. Whichever pull request merges second updates onto the latest main and redoes its cache stamps.
19. Merging. Grok merges Claude's pull requests only after the required checks pass AND John says OK in chat. Claude never merges.
20. Reviews. Grok and Claude review each other's pull requests against the Build standards (rules 10-16). A review is not testing. Every pull request still needs proof on TEST: the walkthrough (e2e-roles) or a person testing it. Claude can't open TEST, so Grok or a tester provides that proof for Claude's work.
21. Claude follows this file too, but never emails the team as John without asking John first.
