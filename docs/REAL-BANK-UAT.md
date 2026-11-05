# Real-bank compatibility and QuickBooks UAT

**Initial state: 0 authenticated real-bank evidence cases and 0 observed QuickBooks imports.** Synthetic Node and Chrome tests are engineering checks, not proof that any bank/export or QuickBooks account will accept a converted file. The independent website must not imply official Intuit/bank certification.

## Two distinct acceptance tracks

1. **Bank source → read-only CSV/XLSX:** obtain an actual authorized bank export; read it in the browser and independently reconcile each date, sign, exact cents, payee, reference and source row order. Confirm the specific bank, region, account type and export dialect. One passing export does NOT prove every format from that bank works.
2. **CSV → QuickBooks Online CSV (or CSV → Quicken QIF):** do the above, then perform a MANUAL test import into a disposable target company/data file. Record edition, region, version/date, account type, mapping, actual imported row count/amount and repeated-import behavior. Only an observed and reconciled application import may support a scoped target-import claim.
3. **CSV/OFX/QFX → Web Connect .qbo and CSV → IIF:** Not implemented or available to users. Do not fabricate financial-institution identifiers (FID/FIID/INTU.BID). Desktop IIF needs a backed-up test company and transaction-type-specific import proof.

## Step-by-step operator checklist — Windows / Chrome

1. Download an **authentic, authorized export** directly from the bank account portal; keep the original in a private folder OUTSIDE GitHub. Never obtain or collect a bank login, account password or tokens.
2. Use the existing preview conversion page on https://csv-qbo.pages.dev/; choose source format, explicit source date order and any CSV column mappings. Save the generated output plus the local validation JSON. Reconcile **every** row against the private original; matching aggregate sums alone is insufficient. Preserve all warning details privately. Unsupported fields or transaction loss are blockers.
3. Compute SHA-256 values for the original and output privately using PowerShell: Get-FileHash -Algorithm SHA256 "C:\private\source.csv" and Get-FileHash -Algorithm SHA256 "C:\private\output.csv". Do NOT copy live source hashes, filenames, account numbers, payees, transaction dates or amounts into the public registry.
4. If testing **QuickBooks Online**: use an expendable test company / account, not an active ledger. In Accounting → Bank transactions → Upload from file, choose the proper test bank account, map Date/Description/Amount, select the desired rows and import. Verify exact imported count, signed cents, dates and descriptions against the ORIGINAL bank export. Note any automatic bank rules and the selected region/date conventions. Repeat import with a test-only duplicate file and record whether duplicates are blocked or possible; do not assume duplicates are prevented.
5. If testing **Quicken QIF**: choose a disposable account and record the actual Quicken edition/year/version and account type. Validate imported dates, cents, payees, references and memos supported by that version; repeat-import behavior is mandatory evidence.
6. Keep a **private** evidence folder with original and output files, local validation JSON, redacted screenshots of actual software results, software version, date and test operator. If the source needs external debugging, create a separate redacted derivative. A modified file alone is not proof that the real original imported.
7. Copy the intentionally INVALID sample in docs/private-uat-case.template.json into a private folder and fill real values. Sign off only after inspecting the private proof. Execute:
   - node scripts/uat-evidence.mjs check-private "C:\private\uat.json"
   - node scripts/uat-evidence.mjs export-public "C:\private\uat.json" > data/uat-public.json
   - node scripts/uat-evidence.mjs check-public data/uat-public.json
8. Review the published JSON diff before committing. The public converter compatibility table is sourced from the approved, allow-listed registry only. Never commit the private JSON or screenshots.

## Private acceptance record

Required case details: case_id, route_slug, input_format, output_format, source_kind=real_bank_export, owner_authorized=true, redaction_reviewed=true, public_bank_label, source_variant, region, SHA-256 hashes of both files, actual parser_commit, test date, original/parsed/exported rows and exact signed integer-cent totals, source_order_fields_match=true after per-row review, private evidence location, operator and reviewer codes, owner_approved=true and screenshot_redacted=true.

For read-only paths, target_product/target_import_result/reimport_result=not_applicable and imported_rows/imported_net_cents=null. For QuickBooks Online CSV or Quicken QIF import, record real target version/account type, target_import_result=accepted_and_reconciled, imported_rows and imported_net_cents exactly equal to the source, and reimport_result=no_new_duplicates OR duplicates_possible_documented.

**Important:** The CLI checks required evidence fields and arithmetic *consistency* but CANNOT independently prove that the bank exported the file or that the operator used QuickBooks. The reviewer must inspect the private primary evidence before approving a case. No bank name, parser family, QuickBooks version or import acceptance should be promoted beyond the tested variant and configuration.

## Release states

| Result | Allowed statement |
|---|---|
| Only synthetic tests | No real-bank acceptance record |
| Reviewed real-bank source/read reconciliation | Real-bank read observed for named export dialect |
| Reviewed real target-app import, reconciled rows and signed cents | Target import observed ONLY in stated app/version/region/account scenario |
| Import failure or mismatched rows/cents | Not compatible; fix and retest |

Do NOT replace absent evidence with additional synthetic tests. Preserve the preview noindex posture. The QBO Web Connect writer route remains excluded until a lawful implementation and REAL QuickBooks target import exist. A QuickBooks CSV formatter is **not** a QBO writer.

## Official reference instructions

- QuickBooks Online manual bank upload: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US
- CSV supported 3/4-column layouts: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US
- Desktop Web Connect: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-connectivity/get-started-bank-feeds-quickbooks-desktop/L5gZcG2Ql_US_en_US
