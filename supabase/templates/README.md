# TEST Auth "Invite user" template (FF-073d)

The portal already sends the property address, first name, and role with every
file invite (Auth user metadata). The live TEST Auth "Invite user" template
still has the Nov 9 wording without those fields, so the received email will
not name the property until this template is pasted once in the TEST project:

1. Open TEST Auth > Email Templates > Invite user.
2. Replace the subject with the line in `invite-subject.txt`.
3. Replace the body with `invite.html`.
4. Leave the SMTP sender as testportal@clatitle.com.

Do not change production. Recovery and other Auth templates stay as they are.
