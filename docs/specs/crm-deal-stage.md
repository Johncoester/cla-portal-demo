# CRM deal stage choices

**Requested by:** Janine, Feedback 30 item 3. Confirmed before this change.

**Status:** In progress. Not on TEST until the portal lead applies `supabase/migrations/20261125100000_crm_deal_stage_labels.sql`. Not Live.

## What the user sees

On a CRM deal, Stage offers exactly four choices: Opened, Closed, On Hold, and Canceled.

The same four choices are in the value list when a custom view, report, or dashboard filters Deals by Stage.

An order that is Open shows as Opened. A saved filter that still says Active matches those deals. Cancelled on the order shows as Canceled.

Someone who runs orders (Processor, Preprocessor, Admin, Super admin) can change the stage on the CRM deal. That saves the order status the portal already uses: Open, Closed, On Hold, or Cancelled. Everyone else sees the four choices and cannot change them.

A new order is still created with Place Order. It starts as Open, which the CRM shows as Opened. There is no separate Create Deal screen.

## What is stored

The order status stays Open, Closed, On Hold, or Cancelled. The numeric order step (`deals.stage`, 0 through 9) is not changed.

The CRM label is computed when a deal is read. The database file rewrites that label inside `private.crm_deal_row` and `public.crm_search`, and rewrites saved deal-stage filters from Active to Opened and from Cancelled to Canceled. It does not update `public.deals`.

## What this does not change

Order status words on the order page, the task board, dashboards outside the CRM, funding, and title. Opportunity stages. Contact relationship stages.
