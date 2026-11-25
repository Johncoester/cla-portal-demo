# Admins edit an agent's profile (JC-AGENT-EDIT-1)

Source: John Coester in chat, Nov 25 2026, 1:57 PM ET ("Can admins edit a realtor's portal, for example add a pic of them"), then "yes" to build it. Tracker item JC-AGENT-EDIT-1 (Requests row 471).

## What the user sees

An Admin or Super admin can open **Edit agent profile** for a real estate agent (Buyer Agent or Listing Agent) and change what the agent's buyers and sellers see:

- Profile picture (optional): choose, crop (circle or square), replace or remove. Same picker, cropper and checks as the agent's own My Agent Profile page: PNG, JPG, WEBP or GIF, up to 5 MB picked, 400 KB after cropping.
- First name and last name (required)
- Cell phone (required, 10 digits)
- Brokerage name and office phone (optional)

Email is shown but locked ("changed by the sign-in provider only"). Birthday, license number and office address are not on this form; they stay the agent's own.

## Where the button is

1. **User List > Edit User** for an agent (an outside login whose contact type is Realtor, or who is a Buyer Agent or Listing Agent on a file): an **Edit agent profile** button next to Save and Back to User List.
2. **Order > Contacts tab**, on a Buyer Agent or Listing Agent row that has a portal login: an **Edit agent profile** button in the row's buttons (next to Edit and Remove from order). Back returns to the same Contacts tab.

The page lives at `#/users/agent-profile/<agent id>` (inside User List, which is Admin only).

## Who can do it

Only someone the portal already treats as an Admin: role Admin or Super admin, or a login with the Admin access tick (the same check User List uses, `isAdmin` / `private.is_admin()`). Processor, Preprocessor, Sales Person, Sales Team, Transaction Coordinator, agents and clients do not see the button, and the database refuses them. An agent can still edit only their own profile.

## Database

`supabase/migrations/20261131060000_admin_edit_agent_profile.sql` (rollback in `supabase/rollbacks/`):

- `public.admin_get_agent_profile(p_profile)` and `public.admin_update_agent_profile(p_profile, p)`, SECURITY DEFINER through `private.rpc_*`, the same pattern as `update_my_agent_profile`. They refuse unless `private.is_admin()`, and only for an active outside login that is a real estate agent, in the same demo scope as the Admin. Only firstName, lastName, cellPhone, officePhone, brokerage, photoShape and photoPath are written; anything else in the request is ignored. photoPath must be blank (remove) or `<agent id>/avatar.jpg`.
- Two storage policies let an Admin upload or replace exactly `<agent id>/avatar.jpg` in the private `agent-photos` bucket. That is where the agent's own upload goes. The bucket's own limits still apply.
- No existing function, policy or grant changes. View as stays read-only.

## How to test it

1. Sign in on testportal.clatitle.com as an Admin or Super admin.
2. Open User List, click an agent's name (Edit), then click **Edit agent profile**.
3. Choose a picture, crop it, click **Use this picture**, change the brokerage, and click **Save agent profile**. You should see "Agent profile saved" and the new picture.
4. Sign in as a buyer on one of that agent's files: the Your agent card shows the new picture and brokerage.
5. Open an order with that agent, go to Contacts: the agent's row has **Edit agent profile**. Back returns to Contacts.
6. Something wrong: clear the cell phone and save. The form says "Cell phone is required." and keeps what you typed. Choose a PDF as the picture: it says "Profile picture must be an image (PNG, JPG, WEBP or GIF)."
7. Sign in as a Processor: there is no Edit agent profile button on Contacts.
