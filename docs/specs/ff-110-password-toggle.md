# Password show/hide eye (FF-110)

**Requested by:** Francis Santos. Source: Gemini notes of the Nov 23 2026 2:35 PM ET meeting (Gmail 1a20abbd6b7e823a); confirm-back 1a20af12dc3a104a. She confirmed "Both" (login screen and invite / set-password screen) on Nov 24 2026, 6:18 PM ET via Francis Feedback.

**Status:** In progress. Tracker row 458. Not Live until this is merged and someone checks it on TEST. No database file. See [ROADMAP.md](../../ROADMAP.md).

## What the user sees

Every password field on these screens has an eye icon that shows or hides the typed password:

- Sign in (`#/login`)
- Choose a new password after a reset email (`#/login`, recovery)
- Agent invite (`#/agent-invite/<token>`), including Confirm password
- Client (buyer / seller) invite on the same accept-invite page, including Confirm password
- HR employee invite (`#/hr-invite/<token>`), including Confirm password

The field starts hidden. The button is a real button labeled "Show password" or "Hide password", works with the keyboard, and is at least 44 pixels so it is easy to tap on a phone.

## What this does not change

- Signing in, resetting a password, and accepting an invite work the same way.
- The e2e Gmail setup page still uses password-type inputs for the Google client ID and secret, without a show/hide eye. Those are not portal login passwords.
