# First real QuickBooks Online CSV import acceptance — operator worksheet

> **Status: NOT RUN.** This page is an acceptance protocol, not an import result, Intuit certification or a bank support claim. Keep all real transaction evidence PRIVATE.

## 1. Use a test environment that can actually import files

- **DO NOT use an Intuit Developer Sandbox for manual CSV import UAT.** Intuit's official Sandbox FAQ says sandbox companies do not support importing or exporting data. Sandbox API integration checks are not banking file acceptance.
- **DO NOT treat QuickBooks Online Test Drive as proof.** The official Test Drive documentation prevents bank connections, does not save changes and is not suitable as a reliable manual bank-import acceptance record. Even if a screen is visible, that does not constitute an import receipt.
- Use a **dedicated, authorized QuickBooks Online company/trial** that permits real manual bank-file upload; check regional availability, subscription terms and access yourself. Do not upload private banking transactions to an environment you do not own or control. A genuine import-acceptance test may not be possible at zero cost.
- Never use a live accounting company's bank account without a prior backup and an explicitly approved test plan. Prefer isolated, non-production, representative, appropriately anonymized transactions where the product permits them. Redaction and modification must be documented separately from original-bank provenance.

## 2. Before import: freeze exact input and output

1. Export an authorized real bank CSV. Keep the untouched original and a separate converter output off GitHub, on your device.
2. Run the **V2.8 local-file preflight** documented in [REAL-BANK-UAT.md](REAL-BANK-UAT.md), with explicit CSV mapping, date order and independent bank row/net totals when available.
3. Preserve both file SHA-256 values in a PRIVATE acceptance folder, not in the public registry. Record parser Git commit, region, export dialect, browser version and any warnings.
4. Use only the **QuickBooks Online 3-column CSV formatter** for this trial. This is Date, Description, Amount, **not** a Web Connect `.qbo`. For this site's exporter, the output date convention is US month/day/year; verify that your QuickBooks regional UI can map or accept it.
5. Review original-to-output text and sign conventions. The QuickBooks three-column output does not preserve source reference IDs or Memo. Record this loss of fields rather than claiming full fidelity. Do not clear, merge, reorder or silently deduplicate real transactions.

## 3. Perform ONE controlled test upload

Open the authorized QuickBooks Online company. As documented by Intuit (menus may vary):

1. All apps → Accounting → Bank transactions.
2. Choose the designated **test bank account**.
3. Link account ▼ → Upload from file; choose your converted **CSV**.
4. Map Date / Description / Amount. If offered an amount-sign reversal control, compare against the original statement before selecting; **never reverse signs blindly**.
5. Review the candidate transactions before selecting them. Record the number of **selected**, **accepted** and **rejected** transactions separately. Note any detected duplicates or warnings.
6. Confirm the upload only inside the approved test account; after completion inspect actual recorded amounts, signs and transactions in QuickBooks. Compare to the original bank statement, not just the exporter report.
7. In a separate disposable account/testing period, evaluate a repeated import only if you can do so without contaminating real books. Record whether duplicates are prevented or possible. Do not assume any default duplicate protection.

Official USA QuickBooks Online help says transaction-list manual uploads support up to **1,000 transactions per upload**. Some regional help describes **350 KB**. The existing website splits single 3-column CSV to 1,000 records / 350 KB per file; this is a conservative generator limit, **not** proof of regional UI acceptance. For more than one generated part, the local V2.11 ZIP inspector verifies **every serialized CSV part and the included validation report** against the original transactions. That proves the downloaded archive's internal integrity, not QuickBooks acceptance. Manually test each upload independently in an authorized test company, and reconcile imported totals across all parts.

## 4. Manual audit checklist (keep private)

- [ ] Bank file source authenticity, authorization and export variant recorded
- [ ] Original statement row count, signs, dates, amounts and reference fields independently reviewed
- [ ] Actual converter output bytes independently retained and hashed
- [ ] Source-to-output technical cross-file verification passed; any unavoidable fields lost documented
- [ ] Company is authorized and separate from production books, target region/plan/version logged
- [ ] QuickBooks CSV upload completed **in the target UI**, not an API sandbox
- [ ] Uploaded/selected/accepted/rejected counts recorded independently
- [ ] Imported signed amount totals, dates, descriptions and individual rows reconciled in the target
- [ ] All warnings, mapping decisions and sign reversal controls recorded
- [ ] Re-import duplicate behavior observed in a safe test, not assumed
- [ ] Reviewer inspected private redacted screenshots or equivalent evidence
- [ ] Reviewer explicitly approved **only** this source variant + target account/version

Passing the local script does **NOT** check these boxes automatically. Genuine primary evidence and human review remain mandatory.

## 5. Public release gate

The website starts with zero accepted bank UAT records and zero manually approved SEO routes. It will not turn on indexing simply because `SITE_URL` points at a custom HTTPS domain and `PUBLISH_SEO=true`.

For each bank reader route, the owner must independently accept an authorized real bank export, include a reviewed case in the privacy-sanitized `data/uat-public.json`, and separately approve the route in `data/production-release.json`. This is a publishing workflow gate; it is **not** Intuit/bank certification. Experimental QBO writing, IIF writing, and the 3-column CSV formatter remain blocked from SEO publication under the reader-only gate.

## Official Intuit sources (checked 2026-11-05)

- Sandbox import/export unavailable: https://static.developer.intuit.com/output_html/qbo/docs/develop/sandboxes/sandbox-faqs.html
- Test Drive restrictions: https://quickbooks.intuit.com/learn-support/en-ca/help-article/small-business-processes/test-drive-quickbooks-online/L9C12ODlA_CA_en_CA
- Manually upload transactions: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US
- Three/four-column CSV layouts: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US
- Regional limits can differ: https://quickbooks.intuit.com/learn-support/en-global/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_ROW_en
