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
<!-- Rule 23 is a permanent rule added after rule 22 (John, Nov 13 2026, 8:39 AM ET), so it keeps the next free number. -->
23. A general instruction from John like 'get everything fixed' never waives a numbered rule. If a rule is in your way, stop and ask John to waive that rule by number.

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

<!-- Rule 22 is a Build standard added after rules 17-21, so it keeps the next free number. -->
22. Every PR that touches a feature updates ROADMAP.md (status, what's built, what's missing, PR link, decisions). Full feature specs live in docs/specs/, one file per feature, linked from the roadmap.

## Working with Claude

John, Nov 11 2026 (t1510u, option B at t1512u). Two builders work in this repo: Grok and Claude.

17. Owner. Grok builds everything by default. Claude builds only the items John assigns to Claude by name (today: the Documents search and sorting, PR 205). The tracker's Owner column says Claude only for those items. Grok leaves the files in Claude's open pull request alone until it merges.
18. Pull requests. Each builder has at most one open pull request. Merges still happen one at a time, in John's order. Whichever pull request merges second updates onto the latest main and redoes its cache stamps.
19. Merging (John, Nov 21 2026, 8:09 PM ET). Any pull request, Claude's or a bot's own, is merged by Grok as soon as all required checks are green and it is up to date with main. John's OK is no longer needed. After the merge, Grok applies on TEST any database file the pull request lists. Rules 3, 4 and 6 still apply: one pull request at a time, Live only after the database file is applied on TEST, and TEST only. Never turn on or try Task Builder flows or templates; John tests those himself. Claude never merges.
20. Reviews. Grok and Claude review each other's pull requests against the Build standards (rules 10-16). A review is not testing. Every pull request still needs proof on TEST: the walkthrough (e2e-roles) or a person testing it. Claude can only open TEST through John's browser, so Grok or a tester usually provides that proof.
21. Claude follows this file too, but never emails the team as John without asking John first.

## Merge duties and team testing (John, Nov 21 2026, 1:42 PM ET "Yes, set it up" / 1:44 PM ET "lets do it"; requester-test emails at 1:46 PM ET)

Starts once the walkthrough (e2e-roles) on main is green after PR 297 merges. Until then the Leader relays merges.

These rules do not replace rules 1-23. Rule 3 still applies: one pull request at a time, all 4 checks green, and the branch updated onto main first if main moved.

24. Same rule for every bot: each bot merges its own green PRs without asking the CLA Title Portal Leader, and updates the PR onto main first if main moved. This replaces asking the Leader for a 'go'. Rule 3 (one PR at a time, all 4 checks green, branch up to date) still applies.
25. A bot may apply its own area's database files on TEST only after the file is merged in the repo. Portal-wide database changes stay with the Leader.
26. Claude's PRs: whichever bot is free merges it as soon as all required checks are green (rule 19; John's OK is no longer needed). Claude does not merge.
27. Any PR touching accounting, sign-in, or who can see what needs a review comment from another builder before merge.
28. Claude will replace the version-stamp chain. When that lands, it merges while nothing else is mid-merge, it must still force browsers to load new code after each merge, and the stamp-test change is explained under rule 5.

<!-- Rule 29 is in force now. It does not wait on the walkthrough or PR 297. -->
29. In force now (John, Nov 21 2026, 1:46 PM ET). After something is built and we need live testing from the team, email the person who requested the change to test it. If you need to follow up, do it through email. Do not ask John to send the emails. Have the bots just send it. The building bot emails the requester (Matt, Francis or Janine) from jcoester@clatitle.com once the item is live on TEST, with a subject starting with '[Written by AI]', CC jcoester-6jkr3p+portal@mail.grokbot.com, plain test steps, and a request for PASS or what's wrong. It follows up by email and marks the tracker "Waiting on requester test".
