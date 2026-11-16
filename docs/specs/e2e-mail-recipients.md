# Walkthrough file email recipients (E2E-MAIL-1)

Source: Claude's audit on pull request 293, https://github.com/Johncoester/cla-portal-demo/pull/293#issuecomment-6915717121 (PR 247 and the stale sentence from PR 252). John approved this as item 1 on Nov 16, 2026, 8:05 AM ET.

## What was going wrong

The walkthrough's file-email test put every address shown on the test file into To, then also added `E2E_MAIL_TO`. Once the test Processor's Gmail is connected, each run would email those people for real. The "Email sellers and agents" card still said "CLA Portal Live Test sends to test addresses only," which stopped being true when that limit was removed on Nov 13.

## What it does now

1. In the walkthrough, the file email's To is only `E2E_MAIL_TO`. Cc and Bcc are cleared after a template is chosen, because a template can fill them from the file. The test checks that list before it presses Send. An address from the file is not in it.
2. If `E2E_MAIL_TO` is blank or not an email, the test skips before it sends. It does not use the addresses on the file instead.
3. The invite on that same test is sent only when the address already on the row is exactly `E2E_MAIL_TO`. Any other address is closed without sending. The test does not type over the contact's email.
4. The card now says the email goes to the address on the file. A person using the portal can still email the address they entered. This change does not put the old test-address list back.

## What is not in this change

The test inbox still replies to the staff mailbox the file email was sent from, so the file can show that reply. That address is the sender, not a party on the file. Gmail is not connected by this change. Nothing is applied to TEST. ROADMAP.md is open in other pull requests, so this write-up is not linked from there yet.
