# How calculator rates get into the portal

The portal does not keep its own fee math. It uses the same calculation as CLA's quote calculator, [cla-closing-cost-calculator](https://github.com/Johncoester/cla-closing-cost-calculator).

A copy of that calculator is stored in the portal so Accounting can propose fees without asking the calculator site to do the math. When someone opens Calculate fees, the portal tries the live rate sheet first. If that sheet cannot be reached, it uses the saved copy and says so.

## The saved copy

The saved copy lives in `js/data/vendor/cla-calculator`.

| File | What it is |
|---|---|
| `calc-core.js` | The calculator's own math, taken from the first script in `index.html`, up to the line that starts the on-screen buttons. |
| `fee-snapshot.js` | The calculator's saved copy of the rate sheet. |
| `VENDOR.json` | A note of which calculator commit was copied, and a fingerprint of each file. |

Right now that note says commit `69568a9`. The rates inside the snapshot are the sheet as of November 2, 2026. The files were copied into the portal on November 4, 2026.

Do not edit the calculator's own lines in those two files. The only portal lines are the short header at the top and the `export` line at the bottom of `calc-core.js`.

`VENDOR.json` records:

- repo: `github.com/Johncoester/cla-closing-cost-calculator`
- commit: `69568a9`
- copied on: November 4, 2026
- a fingerprint of `calc-core.js` and of `fee-snapshot.js`

The same commit and the November 2 date are also written in `js/data/fee-engine.js` as `CALC_SOURCE`.

## The sheet tabs

The live sheet is named **CLA Fee Tables (Live - Calculator)**. The saved copy and the live read use these tabs:

- CLA_Fees
- Recording_Fees
- Transfer_Taxes
- Premium_Tiers
- Premium_Rules
- Endorsements
- Jurisdictions

The first six are required. Jurisdictions can be missing without stopping the read.

## Live sheet, then the saved copy

This is REC-CALC-4. The full write-up is [docs/specs/recording-calculator-live-sheet.md](specs/recording-calculator-live-sheet.md).

Opening Calculate fees calls the calculator's own `loadFees()`. That reads the live sheet. When it works, the form says the rates came from the live sheet and shows the Eastern time they were loaded. The preview uses those rates.

When the sheet cannot be reached, the form says: "Using the saved copy from Nov 2 because the live sheet couldn't be reached." The fees then come from `fee-snapshot.js`.

The checks in `test/test-fee-engine.js` do not call the live sheet. They compare the portal's numbers with the calculator's own math on the November 2 copy.

## Where a rate source plugs in

`js/data/fee-engine.js` can take rates from more than one place. Each source has a name, a label, a version, and a way to load the tabs listed above (the first row of each tab is the header).

Three sources are named:

1. **vendoredRateSource** is the November 2 copy. Tests use this. It is also the fallback when the live sheet fails.
2. **The live sheet** is the calculator's `loadFees()`, used by Calculate fees in the browser.
3. **calculatorSupabaseRateSource** is not connected. Calling it refuses and tells the person the portal is using the built-in copy. The calculator's database today holds quotes and a per-rep settlement fee, not these rate tabs. Nothing in the portal calls this source.

## Refreshing the saved copy by hand

The comments in the vendored files name `tools/vendor-cla-calculator.js`. That script does not exist. Do not add it as part of a rate refresh unless someone asks for it. Copy the files by hand:

1. In [cla-closing-cost-calculator](https://github.com/Johncoester/cla-closing-cost-calculator), note the commit you are copying.
2. From that commit's `index.html`, copy the first script, from the start of the math through the line just before `// ---------- UI ----------`. Paste it into `js/data/vendor/cla-calculator/calc-core.js` between the header and the `export` line. Leave the calculator's lines unchanged. If the portal needs a new function from that script, add its name on the `export` line only.
3. Copy that commit's `fee-snapshot.js` into `js/data/vendor/cla-calculator/fee-snapshot.js`. Keep the portal header and the export line. Leave the snapshot itself unchanged.
4. Update `js/data/vendor/cla-calculator/VENDOR.json`: the commit, the date you copied it, and a new fingerprint for each file (the same kind of fingerprint already in that file). If the sheet date inside the snapshot changed, say so in the pull request. The November 2 date stays until the snapshot itself is a newer sheet.
5. Update the header comment in both vendored files (commit and the date you copied them) and `CALC_SOURCE` in `js/data/fee-engine.js` so the commit matches `VENDOR.json`.
6. Bump the cache stamp. Change the `?v=` number on `calc-core.js` inside `fee-engine.js` to a number higher than every stamp already on main. Then change the `?v=` number everywhere that file is imported, and keep going up through the pages that import those files, until `index.html` loads the new shell. Every import of one file must use the same number. Tests that name the old number have to be updated in the same change, and the pull request has to say why.
7. Run these checks, and fix anything they report before opening the pull request:
   - `node --import ./test/register-supabase-fake.mjs test/test-fee-engine.js`
   - `node --import ./test/register-supabase-fake.mjs test/test-one-stamp.js`
   - `node --import ./test/register-supabase-fake.mjs test/test-crm-page-size.js`
   - `node --import ./test/register-supabase-fake.mjs test/test-crm-sort-arrows.js`
   - `node tools/smoke-mock.mjs` if the sentence on Calculate fees changed

Do not change the calculator repo or the Google sheet from the portal. Do not put a password in the portal. The live sheet is already shared to anyone with the link.
