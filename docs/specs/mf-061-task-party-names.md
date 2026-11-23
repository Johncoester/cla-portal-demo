# MF-061: buyer and seller names on Tasks instead of "client"

**Asked by:** Matt Landsberg, "Portal Feedback Nov 22" (notes doc https://docs.google.com/document/d/17GqvpKFugQPTiZRxirUALImu1yCsXZsV3u1fJmWLoYg/edit and recording: "instead of saying client, it needs to say the name ... Bob Smith seller ... Susan Smith seller"). Confirmed in Matt's reply Nov 22 2026, 1:54 PM ET (Gmail 1a2049c9ec631d7b): "THE PROCESSOR USER AND THE SCREEN CALLED 'TASKS'. THE BUYER AND SELLER USERS SHOULD SPECIFY THE NAMES OF THE RESPECTIVE BUYERS AND SELLERS." Buyers as well as sellers: "YES". Tracker row 439. Split out of MF-060 item 2.

## What changed

- **File > Tasks (processor and every staff role):** the Assigned to column shows the person's name with Buyer or Seller under it, e.g. "Sally Seller / Seller", instead of "Client-Seller". A task for a whole side shows every name on that side ("Bob Smith & Susan Smith / Sellers"). A refinance buyer is the Borrower. With no name on file it says "Seller" or "Buyer".
- The "Fill in for client" button says "Fill in for Sally Seller". The Edit task box says "Assigned to Sally Seller (Seller)".
- **Buyer and seller logins, File > To-do list:** the same column shows their own name ("Ben Buyer / Buyer") instead of "Client-Buyer".
- **The task page** (opening one task) says "For Sally Seller (Seller)" instead of "For Client-Seller (Client-Seller)", and "Only Sally Seller or CLA Title can mark this task complete" instead of "the client".

## Why it was generic on TEST

The Tasks tab and the task page open on the file shell, which has no parties, and hosted task rows carry no owner name. The names now come from the file's existing `deal_contacts` and `deal_entities` reads, once per file, started when the Tasks tab opens. A failed read leaves the role word.

## Not changed

- No database change. Who can see which contacts is unchanged; a buyer or seller still sees only their own tasks.
- The cross-file All Tasks page, agent task pages, and the TC overview already use their own labels and are not part of this item.
