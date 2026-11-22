# Place Order walkthrough picks a real salesperson (E2E-FIX-B)

Source: John, Nov 19 2026. Tracker row E2E-FIX-B (Requests tab, row 390). No video. Pull request: [PR 369](https://github.com/Johncoester/cla-portal-demo/pull/369). Evidence: GitHub Actions run [44513431332](https://github.com/Johncoester/cla-portal-demo/actions/runs/44513431332). The same Place Order check has failed since run [44163727716](https://github.com/Johncoester/cla-portal-demo/actions/runs/44163727716), after FF-092 (pull request 322, commit 8dbc9be1).

## What was asked

The Place Order walkthrough types "Sam" into Salespeople on this order and expects a match. On TEST that name is Sam Demo, a demo user. The E2E Processor login is not a demo login, so the portal correctly hides Sam Demo and the list says "No match." Search for the real non-demo salesperson, E2E Salesperson, and use that name when the chip and the saved salesperson id are checked. Leave the nonsense-name check and the file-number prefix checks as they are. Do not change the portal.

## What it does

On TEST, Team & Notes searches for E2E Salesperson, picks that person, sees the name on the chip, removes the chip, and picks the person again so one salesperson id is saved. A name that is not a person still says "No match." The fake-data run still searches Sam, because the sample salesperson is Sam Salesperson and that person is not a demo user.

## Why the test changed

The test used a demo-only name. Sam Demo is marked demo and is correctly hidden from the non-demo processor. The check was out of date after the salesperson search (FF-092). The portal behavior is unchanged.

## What is not in this change

No screen change. No database file. No SQL applied. No secrets. The file-number prefix checks (Virginia, then Florida) were not reached in recent runs, because the walkthrough stopped on the Sam search. This change does not prove those prefix checks. Other failing walkthrough checks on the same run are left alone.
