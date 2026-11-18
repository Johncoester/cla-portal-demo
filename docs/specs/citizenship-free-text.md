# Citizenship on one line (JN-CITIZEN-1)

Source: Janine's email reply, Nov 17 2026, relayed via Francis Feedback. Tracker item JN-CITIZEN-1. "Per Francis, let's switch back the Citizenship field to a single line where users can type their responses."

## What was asked

Citizenship had been a dropdown: U.S. Citizen, Permanent Resident, Non-Resident Alien, and Other, with "US Citizen" kept for an answer already on a file. Switch it back to one line the person types, on every Citizenship field.

## What it does

On Personal information, a buyer and a seller type Citizenship. The spouse section uses the same kind of line. An answer already saved shows in the line and can be saved again, including "US Citizen". A new answer does not have to be one of the old choices. Blank is allowed.

The spouse answer stays in `spouse_info.citizenship`, which is already plain text. The Personal information answer stays on the task. The database file changes the question on the existing templates from a dropdown to a line. It does not add a column. TEST had no check and no enum limiting the values. If a check that names citizenship is present, that file drops it.

## What is not in this change

The database file is not applied on TEST by this change. Until it is applied, Personal information on TEST still shows the dropdown. The spouse line there is already a text box. The earlier change that also updated the agent-card phone is left as it was.
