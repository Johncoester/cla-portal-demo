# Admin fee Payable by (FF-093)

Source: Francis Santos, email Nov 17 2026, 1:37 PM ET (Gmail msg 1a1eacd7648484d9). Tracker FF-093. Medium. The same email also asks for a searchable salespeople list and a simpler Accounting > Contract Figures section. Those are separate items.

## What was asked

On the file, in the Admin fee section, add Payable by. The choices are Buyer, Seller, and Split (Buyer and Seller). The choice is saved on that file and is still there after a reload.

## What it does

Open a purchase file, open Agent fees, and click Edit on the listing agent or the selling agent. Under Admin fee, Payable by is Buyer, Seller, or Split (Buyer and Seller).

Buyer and Seller work as they did. The buyer's agent side still starts as Buyer. The listing side still starts as Seller.

Split means the buyer and the seller each pay half. An odd cent goes to the seller, the same way a split recording tax is divided. A $395 admin fee is $197.50 and $197.50. A $10.01 admin fee is $5.00 from the buyer and $5.01 from the seller. The screen says those two amounts when Split is chosen. There are no extra amount boxes. A commission Split is still two amounts that must add up to the commission. That is a different field.

The choice is stored on the file with the rest of that agent's fees. Opening the file again shows the same choice.

The admin fee already posts to the fee ledger, the settlement statement, and Closing Disclosure section H. Those buyer and seller columns use the same split. Taxes & Fees is the recording and transfer calculation. It does not include this admin fee, so it is unchanged.

Other fees stay Buyer or Seller. A bad choice is refused in plain words, and what was typed stays on the form.

## What is not in this change

Place Order still takes the admin fee amount only. Payable by is on the file, in Agent fees. The database file is not applied on TEST. Not Live.

No new columns. Split uses the buyer and seller amounts the fee row already has. The migration lets an admin fee use them, and it fills in the two halves. Rolling that file back puts an admin fee that was Split onto the side's usual payer (buyer on the buyer's agent side, seller on the listing side) and clears the two halves. A commission Split is left as it was.
