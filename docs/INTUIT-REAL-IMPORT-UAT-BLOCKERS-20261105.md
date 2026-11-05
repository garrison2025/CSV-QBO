# Authentic bank export and QuickBooks Online upload UAT — evidence boundary (2026-11-05)

> **Scope of this audit:** independently checked **public official current documents** against the existing CSV-QBO source, synthetic Node tests and Chrome E2E harness. This is NOT a bank-issued original acceptance test and NOT an actual QuickBooks file upload. No user bank or QuickBooks login was used.

## Status, strictly separated

| Gate | Observed status | Why |
|---|---|---|
| Core local financial conversion / exact output row and signed-cent reconciliation | **Automated PASS — synthetic** | GitHub CI tests and real Chrome synthetic upload/download; source `src/core.mjs`, `tests/browser-e2e.mjs` |
| Independent third-party bank-format regression | **7 fictional external fixtures tested** | `docs/INDEPENDENT-SAMPLE-VERIFICATION.md`; these **are not actual bank-issued originals** |
| Current Intuit published 3-column CSV contract | **Specification reviewed** | Exact header Date, Description, Amount; negative outflow / positive inflow; site generates it in `toQuickBooksCSV` |
| Published Intuit size / count | **Specification reviewed + automated generator checked** | USA QBO Online manual upload 350 KB maximum and up to 1,000 transactions; generator uses 350,000 bytes and 1,000 rows per CSV part |
| **Bank-issued original export acceptance** | **0 accepted — BLOCKED** | No verified issuer-original bank export, independently counted source ledger or owner approval; bank help pages describing exports are not transaction files |
| **Actual QuickBooks Online UI bank-feed CSV import** | **0 accepted — BLOCKED** | No authorized real QBO test company and observed Import/Review/Done evidence |
| Intuit **Developer Sandbox** as alternate UI import target | **NOT ELIGIBLE** | Intuit's own Sandbox FAQ: *Can I import or export data from sandbox companies? No. You can't import or export data to or from sandbox companies.* |
| Site indexing and bank certification | **BLOCKED** | Current `data/uat-public.json` has zero sign-offs; preview stays noindex,nofollow |

## Official sources checked, including 2026-dated Intuit updates

1. QuickBooks US: [Format CSV files in Excel to get bank transactions into QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US) — updated Aug 24, 2026. QBO supports 3-column (Date, Description, Amount) and 4-column (Date, Description, Credit, Debit) CSV; 3-column amounts use signed out/in.
2. QuickBooks US: [Manually upload transactions into QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US) — updated Aug 24, 2026. Requires 350 KB or smaller per transaction-list file, English, and up to 1,000 transactions per upload. Actual success requires Upload from file → Account → Match columns → Select transactions → Confirm → Done.
3. QuickBooks US: [Common errors importing bank transactions using CSV](https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/common-errors-importing-bank-transactions-using/L02IgW462_US_en_US) — updated Aug 3, 2026. Warns against incorrect column mappings, problematic description characters, wrong date order and mixed debit/credit formatting.
4. Intuit Developer: [Sandbox FAQ](https://static.developer.intuit.com/output_html/qbo/docs/develop/sandboxes/sandbox-faqs.html) — sandbox companies are free developer test environments but *do not support import/export*. An Accounting API create call would **not** prove acceptance via the bank transaction CSV upload interface.
5. Example actual bank export instructions (not downloadable originals): [Monzo](https://monzo.com/help/budgeting-overdrafts-savings/exporting-my-transactions), [Mercury](https://support.mercury.com/hc/en-us/articles/28768700685844-Bulk-export-statements-receipts-and-CSVs-from-Mercury-Business), [Co-operative Bank](https://www.co-operativebank.co.uk/business/faqs/ways-to-bank/online-banking/statements-and-transactions/can-I-export-transaction-information/prod-11451). The Co-operative Bank explicitly documents extra header/footer rows in one older CSV variant; **CSV-QBO deliberately does not silently skip unidentified bank preambles/footers**. Such bank-specific variants need a real original and independent reconciliation before a format adapter is claimed.

## Independent published-spec checks (NOT observed QuickBooks imports)

- The generator emits three fields in order `Date,Description,Amount` and serializes signed amounts with two decimal places in US-style dates. QBO's UI requires checking the date-format selector and target account type: recommended document date order `dd/mm/yyyy` is **not proof** that a particular US `mm/dd/yyyy` file fails or succeeds.
- By design, source description values are preserved and spreadsheet-formula-like descriptions are prefixed for CSV safety. Intuit documentation warns some special characters may prevent import; **safe CSV structure alone is insufficient evidence** of successful QBO import. A target QBO upload must check them.
- The source code permits explicitly zero-valued transactions (with a warning) to avoid silently removing bank rows, but Intuit recommends blanking zero-valued Amount/Credit/Debit cells. This is a **known target import risk**, not a proven defect: never change source accounting amounts or omit transactions solely to make a fake import succeed. Test zero-amount cases separately in an authorized QBO company.
- A source credit-card CSV can carry the opposite sign convention from a bank checking account. User must select an appropriate QBO account and visually reconcile deposits/outflows; code does not reverse signs heuristically.

## Fastest real acceptance protocol (requires lawful external access)

**For each bank issuer** (user or authorized tester): export a short original CSV/QBO/QFX/OFX directly from their **own bank account**, without screenshots as replacement. Keep originals and any account numbers/merchant names in a private local folder **outside the repository**. Independently count bank rows and exact signed cents from the source account, not from our parser. Then run local `npm run uat:local` with the **original input file and locally downloaded converter output** plus explicit mapping/date order. Compare source and output row by row. Obtain permitted source authenticity/reviewer approval. Do NOT upload sensitive bank data to public GitHub/issues/AI chat.

**For QuickBooks Online import**: use an **authorized, nonproduction/test-only QBO company** with no live bookkeeping or production bank feed. Open Bank transactions → Upload from file; choose the generated 3-column CSV; explicitly map Date/Description/Amount and correct date format; review the count/signs; confirm in QBO; check actual imported lines, amounts, chosen bank/credit-card account and duplicates. Record a redacted QBO outcome, target version, account type, parser commit, and return import outcome. Repeat-import behavior must be reviewed, not assumed. Never perform this on a production company without informed authorization and an accounting rollback plan.

**Evidence gate**: The repository's `scripts/uat-evidence.mjs` already refuses synthetic files as authentic source UAT, requires issuer-original source SHA-256, output SHA-256, independently checked rows and exact net cents, private proof, real QBO imported count/net cents, observed reimport result, and owner signoff before any public acceptance case is exported. In `data/uat-public.json`, `cases: []` accurately remains empty until those observations exist.

## Decision

Official rule review and synthetic/source-format regression are useful engineering evidence and can be self-run, but **cannot substitute** for bank-account-original verification or observed QBO UI import. No assertion of issuer compatibility, QBO certification, or production release is made by this audit. No custom domain, server-side bank uploads, paid APIs, or indexing changes are authorized by it.
