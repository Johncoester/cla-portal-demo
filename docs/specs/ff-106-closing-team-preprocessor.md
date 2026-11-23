# Preprocessor on the Closing Team card (FF-106)

Source: Francis Santos, email Nov 20 2026, 9:13 AM ET. She confirmed the confirm-back on Nov 23 2026, 11:59 AM ET (Gmail 1a209598512b3bd1): add a Preprocessor entry on the File Overview Closing Team card; the label reads Preprocessor and shows the assigned CLA preprocessor's name; layout, styling, other roles, and the agent's own TC role and link stay unchanged. Tracker row FF-106. This is not a rename of the Transaction Coordinator card.

## What was asked

On the staff File Overview, add a Preprocessor card to Closing Team. Show the CLA Preprocessor assigned to the file. If nobody is assigned, the name is blank and the role title stays, the same way the other cards work. Do not change layout, styling, the other Closing Team roles, or the agent's own Transaction Coordinator role and link.

## What it does

Staff see a Preprocessor card between Processor and Transaction Coordinator. The name comes from the Preprocessor already saved on the file (`preprocessorUserId`). A missing assignment leaves a blank name. Buyers, sellers, and agents still do not get the staff Closing Team row. Hosted files fill the Preprocessor's display name the same way they already fill the Processor and Transaction Coordinator names.

## What is not in this change

No database file. The Transaction Coordinator card is not renamed. Licensed Settlement Agent still has no saved field, so that name stays blank. This change does not assign Ellen or anyone else as a Preprocessor on TEST. Not Live until the pull request is merged and checked on TEST.
