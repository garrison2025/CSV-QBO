# CSV→QBO competitor verification: second-pass evidence (2026-11-05)

## Evidence labels

- **OBSERVED FILE** means a real QBO was downloaded from the specified competitor in an instrumented Chrome session, with bytes, SHA-256, and independent transaction-content checks.
- **PUBLIC PAGE ONLY** means only a browser-visible page or marketing flow was read. The converter was **not** executed.
- **BLOCKED / ACCOUNT REQUIRED** means the specific test environment did not obtain output, **not** that the vendor's product is broken.
- **QUICKBOOKS IMPORT NOT VERIFIED** means a target QuickBooks installation did not independently accept the generated QBO.

## Current actual evidence (do not silently upgrade)

| Provider | Evidence | QBO output obtained | Outcome |
|---|---|---:|---|
| Sonomir (https://sonomir.com/csv-to-qbo) | Original synthetic input CSV and actual 923-byte competitor QBO, pinned fixture / SHA-256 and tested with writer and reader | Yes | **OBSERVED FILE**, 2 rows, signed net +825 cents; still no actual QuickBooks import |
| AccountingConverter (https://accountingconverter.com/tools/csv-to-qbo) | Real Chrome upload and API HTTP 403 responses, original run 41987344999 | No | **BLOCKED / INCONCLUSIVE**; its public page advertises no-account conversion |
| DocuClipper (https://www.docuclipper.com/solutions/convert-csv-to-qbo/) | Public CTA signup and official product help requiring logged-in conversion workflow | No | **ACCOUNT REQUIRED / INCONCLUSIVE** |
| QBO Maker (https://qbomaker.com/) | Public no-signup local converter page | No | **PUBLIC PAGE ONLY** |
| CSVdock (https://csvdock.com/csv-to-qbo) | Public no-signup local converter page with a sample button | No | **PUBLIC PAGE ONLY** |
| BalanceTick (https://balancetick.com/convert/csv-to-qbo) | Public browser-local converter page with limited free allowance | No | **PUBLIC PAGE ONLY** |
| ConvertFin (https://convertfin.com/convert/csv-to-qbo) | Public browser-local converter page | No | **PUBLIC PAGE ONLY** |

The four additional providers are **candidates to run**, not independent conversion passes. The project contains a narrowly scoped **unexecuted**, one-time Chrome comparator probe at `scripts/probe-additional-competitors.mjs`. It is not included in permanent CI, has not produced a new download, and is not sufficient to change release status.

## Synthetic source and comparator rules

- Public two-transaction source: `/samples/sonomir-synthetic-source-test-only.csv`
- Input SHA-256: `fcd3ccce6ad75502788e588ac78765954fa16e02d88b409d83f6317ce5de2cd9`
- Fictional Espresso, 2026-10-14, **-12.50 USD**
- Fictional Refund, 2026-10-15, **+20.75 USD**
- Expected **2** rows and net **+8.25 USD (825 cents)**.
- Previously observed Sonomir QBO: **923 bytes**, SHA-256 `00e5202de9a425ed3d0c4fba337271e54cfe8e48a87538c394c378ae95a74e69`.
- For any other provider: require a downloaded .qbo artifact, file SHA-256, source/target dates, signed cents, payee, unique FITIDs, account and currency structure, and an independently parsed row-by-row comparison. A marketing page or valid-looking QBO fragment is **not** enough.
- Do not insert real customer statements, bank credentials, account identities, or payment details into any third-party converter. Only clearly fictional values.
- Actual QuickBooks imports observed: **zero**. Actual authenticated bank-issued reference files observed: **zero**. Public `/tools/csv-to-qbo/` remains **unreleased** and the lab remains **noindex**.

## Independent Intuit requirements checked

1. QuickBooks Online official upload guidance says transaction-list uploads must be in English and **350 KB or less**, and suggests QBO, QFX or CSV; it also describes formats with 3 or 4 columns. Thus the AccountingConverter page's *no QBO size limit* marketing claim is **not adequate** to override the documented 350 KB QBO upload guidance. Refer to https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US .
2. Intuit's OFX connectivity documentation says Web Connect is associated with a contracted **BID (Branding ID)**; QBO schema validity alone does not establish an authorized issuer or proof of target-software acceptance. https://www.intuit.com/partners/fdp/implementation-support/ofx/why-connect/connectivity-types/
3. DocuClipper official conversion instructions describe actual mapping, reconciliation and bank/account fields inside its application, not a downloadable QBO from the public marketing page: https://docuclippersupport.zendesk.com/hc/en-us/articles/30844426880276-How-to-Convert-CSV-to-QBO-with-DocuClipper

## Reproducibility and release gate

Previous real original-provider run: https://github.com/garrison2025/CSV-QBO/actions/runs/41987344999

Previous merged writer/Chrome run: https://github.com/garrison2025/CSV-QBO/actions/runs/41995671707

The second-pass external browser workflow could **not** run in this session. The metered interactive browser provider had insufficient wallet credit; separately, the attempt to add one-time third-party website probes to GitHub Actions was blocked by a platform safety check. This is a tooling blocker, **not** a vendor conversion failure. The attached script is preparation only and must be executed and reviewed before reporting any new competitor-output result. Do not weaken site release or SEO gates based on this document.
