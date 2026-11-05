## V2.11: Independently inspect actual downloaded XLSX and split QuickBooks ZIP bytes

The previously unsupported source-to-XLSX and multi-part QuickBooks ZIP cross-file preflight now has a **separate output-byte inspector**, built without external dependencies and independent of the application's XLSX ZIP writer. The same private manifest and local command work with these outputs; choose `qbo-to-excel`, `qif-to-excel`, `ofx-to-excel`, `qfx-to-excel`, or `iif-to-excel` for downloaded `.xlsx`, or `quickbooks-csv-formatter` with downloaded `.zip` for large outputs.

- For **XLSX**, the inspector checks the *actual ZIP bytes* (directory boundaries, CRC32, duplicate file names and storage type), sheet headers, date serials and styles, exact signed cents, row order, descriptions, reference IDs, included Memo fields, formula absence, and worksheet row count. Any omitted nonempty source Memo requires you to re-export with Include Memo. The inspector intentionally rejects differently compressed or re-saved Excel workbooks rather than treating them as exactly matching the website's original download.
- For **QuickBooks multi-part ZIP**, every packaged CSV part is re-read and compared to the original source row order, date, descriptions and cents; the parts must be consecutively numbered with no missing or unexpected files, each part must respect the built-in QuickBooks CSV limits, and the packaged validation JSON must match recomputed results exactly.
- The local report hashes the original and actual output bytes, never publishes transactions, and still has `owner_approved:false`, `source_kind:PENDING_AUTHENTICITY_REVIEW` and `target_import_result:NOT_RUN`. No bank authenticity or actual Excel/QuickBooks application acceptance is inferred.
- **Limits:** This exact archive checker accepts only the uncompressed *stored* ZIP shape emitted by the website, not arbitrary ZIP dialects; Microsoft Excel or accounting software import acceptance remains untested. Continue independent bank portal and target UI review.

Run `node scripts/uat-local-check.mjs "C:\private\case-manifest.json"` from the repo directory, with private input/output paths outside Git. The manifest schema is unchanged.

---

# Real-bank compatibility and QuickBooks UAT

**Important target-UAT correction (2026-11-05):** Intuit's official developer Sandbox FAQ says Sandbox companies **cannot import or export files**. The QuickBooks Online Test Drive is not a trustworthy bank-import acceptance environment. Use an authorized, isolated real/trial QuickBooks Online company that explicitly permits manual uploads, or mark import UAT NOT RUN. No guaranteed free import-capable account exists in this project. See [the actual QuickBooks import acceptance worksheet](QUICKBOOKS-REAL-IMPORT-UAT.md). Do not mistake a sandbox API write or parser self-test for a manual CSV import.


## V2.8: Local verification of actual bank export files

This is an executable, local-only source-versus-export comparison. It does NOT authenticate the bank file or test QuickBooks imports. It never uploads source data.

**Currently covered:** QBO/QFX/OFX/QIF/IIF to generic CSV or independently inspected XLSX; explicitly mapped bank CSV to QuickBooks Online 3-column CSV as one file or as all parts of the ZIP; CSV to QIF. It compares date, signed cents, payee, reference, Memo when supported, row count and source order, and records SHA-256 of the actual files. Import target acceptance requires a separate QuickBooks/Quicken manual UAT.

**Not covered by this checker:** Web Connect .qbo creation, CSV to IIF, independently establishing bank authenticity or downstream application acceptance. It rejects those unsupported outputs instead of displaying a false PASS.

### Windows / PowerShell workflow

1. Keep the authentic bank download, converted output, manifest and report in a PRIVATE directory outside the cloned repository. Install Node.js 20+ on your own PC. Do not upload private originals or screenshots to GitHub, CI, or this chat.
2. Copy docs/local-preflight-manifest.example.json into your private directory and fill the file paths, route_slug, source date order and (for CSV) the seven explicit column indexes. Indexes are ZERO-based; use -1 for absent fields. For example Date,Description,Amount,Reference maps to date=0, description=1, amount=2, id=3, debit=-1, credit=-1, memo=-1.
3. If independently recorded in the bank portal/statement, fill expected_rows and expected_net_cents as exact signed integer cents. Otherwise leave null rather than guessing these values from the converter.
4. In the checked-out repo run this exact command from PowerShell:

       node scripts/uat-local-check.mjs "C:\private\case-manifest.json"

5. If successful, a private JSON draft is written to report_file, outside the repository. The tool never overwrites an existing report. A local technical match is NOT QuickBooks import validation.
6. Independently compare the original bank export against the bank's displayed transaction records, including independent totals, date/signs, references, duplicates and fields not represented by the output. Screenshots stay private and should be redacted.
7. For QuickBooks Online CSV, manually import into an authorized, isolated upload-capable test or trial company/account (not an Intuit Developer Sandbox), and record actual row count, sign/amount, target version, account type and repeat-import behavior; the application may differ by region/account. For QIF use a disposable Quicken data file.
8. After source authenticity and target-import UAT are independently reviewed, complete the separate PRIVATE UAT registry and run the validation commands in the rest of this document. The draft intentionally cannot be published: source_kind is PENDING_AUTHENTICITY_REVIEW, owner_approved is false, and target_import_result remains NOT_RUN.

**Privacy guardrails:** File paths inside the repository are refused, parser errors are not echoed with potentially sensitive bank values, and the exported draft's hashes and aggregate financial totals are confidential. Never copy the draft directly into data/uat-public.json. IIF extraction represents TRNS summaries only, not SPL allocations; QuickBooks three-column CSV intentionally omits source reference/Memo fields.

**Shared-parser limitation:** This script reuses the application's parsing and export-validation code, so a shared bug could escape. It is not a substitute for independent bank statements and manual downstream import verification.

---

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
