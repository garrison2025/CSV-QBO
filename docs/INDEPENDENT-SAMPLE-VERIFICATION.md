# Independent external fictional bank-format cross-checks — 2026-11-05

**Evidence classification:** independent external, publicly distributed, **fictional** bank-format fixtures. They were authored by a different open-source project. They are NOT live exported bank transaction files, not bank-certified export variants, and not observed QuickBooks/Quicken imports. This test suite does not change the real-bank UAT acceptance ledger, which remains **0 approved bank files / 0 observed QuickBooks imports**.

## Fixture provenance and license

Source project: [Maxed-OSS/statement-normalizer](https://github.com/Maxed-OSS/statement-normalizer), `examples/` directory, Apache License 2.0. The unmodified fictional examples were copied into the test-only module [tests/external-bank-fixtures.mjs](../tests/external-bank-fixtures.mjs). Preserve the upstream [Apache 2.0 license](../tests/fixtures/THIRD-PARTY-APACHE-2.0-LICENSE.txt) with these fixtures. All transaction values, names and identifying fields are fictional sample data.

The test module has seven external fixtures with explicit hard-coded expected row counts, net signed cent totals and column mapping, *not* values learned from the CSV-QBO parser. Tests independently re-parse the **actual generated CSV wire**, verify per-row values and totals, and exercise the real Chrome DOM upload/preview/download workflow.

| Public fixture name (NOT a live bank export) | Records | Independent sample net | Finding |
|---|---:|---:|---|
| Chase-style checking CSV | 5 | +1,225.50 | Separate posting date and extra columns; mapped Date, Description, Amount and optional check reference |
| Bank of America-style checking CSV | 5 | +2,307.28 | Quoted commas in Running Balance; ignore running balance rather than treat it as a transaction |
| Wells Fargo-style checking CSV | 5 | +1,119.22 | The Payee column is empty throughout, with description in Memo; user must **explicitly map Memo to Description** (or import is rejected). The output has no independent Memo after remapping |
| American Express-style credit card CSV | 6 | -31.27 | Source *charges are positive* and payments negative. The parser preserves their signs; cannot assert suitability for QuickBooks bank-account import without **credit-card target mapping review** |
| Capital One-style credit card CSV | 5 | +76.47 | Separate Debit and Credit with posted date; amount is treated as credit minus debit. The target credit-card semantics still need manual review |
| Discover-style credit card CSV | 5 | -86.68 | Source card charges are positive; **no automatic polarity guessing**. Customer must verify their target account before import |
| Quicken QIF | 4 | +1,213.51 | Contains `D03/15'24` (apostrophe two-digit 2000s date), thousands-separated amount and unexportable QIF category fields |

**Test vs. bank acceptance:** tests run on 7 independent publicly sourced mock export *shapes*, not 7 banks proved compatible. A matching test row count and exact amount only demonstrate these particular fictional inputs and these output serializers.

## Discovered format limitation and fix

The vendor's public QIF fixture used an older legitimate Quicken date convention `month/day'YY`. Before this change, CSV-QBO refused those dates. The QIF reader now accepts explicitly marked `20YY` dates, including a legacy space-padded form, with an explicit warning and exact calendar validation. It continues to reject ambiguous slash-separated two-digit years rather than guess the century. The exact original sample is preserved in the test module.

Independent sources:
- Quicken forum: https://community.quicken.com/discussion/7891105/downloaded-qif-data-from-bank-to-excel-then-quicken-imported-date-as-1920-rather-than-2020
- GnuCash QIF discussion: https://lists.gnucash.org/pipermail/gnucash-user/2023-January/104630.html
- Intuit QuickBooks Online 3-column CSV specification: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US
- Intuit warns that imported bank statement and credit-card sign conventions depend on account type: https://quickbooks.intuit.com/learn-support/en-uk/help-article/bank-transactions/prepare-csv-file-bank-upload-quickbooks/L4BjLWckq_GB_en_GB

## What is still untested

- Authentic bank-issued exports from these six named banks (none acquired).
- Actual QuickBooks Online manual CSV import into an authorized import-capable test company (none performed).
- Regional date/credit-card sign mapping, duplicate behavior, target account type, and zero-amount imports, which are target-app behaviors rather than CSV serializer guarantees.
- OFX/QFX/QBO **actual issuer exports**; synthetic OFX Chrome E2E exists separately.
- Any claim that the QuickBooks 3-column CSV output is itself a Web Connect `.qbo` file.

**Do not turn the six illustrative bank labels into 'supported banks' badges or change `data/uat-public.json` until source provenance and real application UAT are verified.**

## V2.12 — observed UX mapping failure and corrected guidance

The external Wells Fargo-style fictional sample has a blank Payee and populated Memo on all five records. An automatic column-header guess selects Payee as Description and therefore correctly refuses preview; it must NOT silently take Memo without an operator decision. The browser now displays a privacy-preserving all-row fill audit and a **Use Memo as Description** action. On explicit click, the file remains untouched, Description is remapped to Memo, duplicate Memo mapping is cleared, and export remains disabled until Preview completes. Positive/negative amount labels are neutral so American Express/Discover-like source sign conventions are not mislabeled as deposits or withdrawals. Target QuickBooks bank vs credit-card account polarity remains unverified.

## V2.13 — date/amount safety edge cases

Synthetic CSV regression cases test genuinely ambiguous month/day order (e.g. 03/04/2026) and ensure changing from US to day-first alters only the intended calendar interpretation, not amounts or record order. An all-blank Debit/Credit row fails rather than fabricating a zero-dollar transaction. Explicit 0.00 and amounts of USD 1,000,000 or greater are preserved, but require a visible review acknowledgment in the website. These are safety and usability results on mock data, not authentic bank compatibility or actual QuickBooks upload acceptance.

## V2.14 — synthetic OFX transaction-correction and sign safety cases

Synthetic OFX 1.x SGML and 2.x XML test files now exercise `CORRECTFITID`/`CORRECTACTION` as valid *correction* commands, not ordinary purchases. All variants, including `DELETE`/`REPLACE`, incomplete declarations and unknown actions, **block** download; the reader does not try to reconstruct prior FITID history. Sample values placed in XML CDATA/comments are not mistaken for actual correction tags. Explicit DEBIT/CREDIT sign mismatches trigger review but preserve original signed cents. Invalid GMT offsets fail rather than being silently accepted. Browser tests exercise actual QBO file upload, error privacy, sign warnings and downloaded CSV contents. These are local/synthetic checks only, not authentic bank exports or acceptance by QuickBooks.

## V2.15 — source-local duplicate FITID collision detection

New *synthetic* OFX 1.x SGML and OFX 2.x XML fixtures explicitly reuse a FITID. Same-ID/same-fields rows are preserved with two warning mechanisms; same-ID changes to normalized posting date, exact signed cents, payee description, separate Memo or TRNTYPE are rejected without emitting partial CSV/Excel output. Additional fixtures verify spurious account/FITID markup in CDATA and comments does not count as a second account, but true multiple BANKACCTFROM / CCACCTFROM declarations do. Batch tests prove a collision inside one source blocks the entire archive, while same FITID across separate account exports is only a possible overlap. Privacy-minimized JSON reports contain only counts, ordinal positions and general warnings, never the source ID. These checks are **not** bank-issued origin or external software import acceptance.

## V2.16 — OFX balance aggregates, syntactic validity versus actual reconciliation

Synthetic OFX 1.x and 2.x sources now test true ledger/available balance tags, invalid decimals, duplicate, truncated or nested groups, missing as-of dates, negative values, and inert tags inside comments or CDATA. Both original balances are validated without retention in the returned integrity fields. A readable browser note and redacted JSON summary report only presence and as-of dates with an explicit *not independently reconciled* boolean. Actual verified opening balance, complete bank transaction history and real target-software import results remain unavailable. These tests are safeguards against **false completeness claims**, not certification of financial statement reconciliation.

## V2.17 — strict balance/statement association fixtures

Independent synthetic test variants now place `LEDGERBAL` before/after a closed account response, inside BANKTRANLIST, with a mismatched statement closing tag, or without any complete bank list. None may be incorrectly assigned to a valid transaction set. Complete STMTRS and CCSTMTRS variants continue to parse. A bank-provided ledger as-of date earlier than a transaction's posted day produces a review-only count with unchanged row totals and signed amounts. Privacy-focused Chrome tests verify no bank balance numbers appear in report JSON or error messages. This is not a real financial reconciliation, bank statement certification, or external software import result.

## V2.18 — synthetic CSV header mapping and physical line validation

New synthetic cases contain two money columns (`Amount` / `Transaction Amount`), two date columns (`Transaction Date` / `Posted Date`), duplicate source header names, multiline quoted merchant text and CR/LF/CRLF bank-style files. The parser reports numeric header ambiguity and correct physical source lines without changing selected signed cents or leaking invalid monetary field strings. The real Chrome suite verifies duplicate selector labels include column positions, warning acknowledgment resets after remapping, and actual CSV downloaded bytes reflect only the user's selected source column. These are technical local tests, not issuer-original or QuickBooks target import evidence.

## V2.19 — Windows-1252 CSV and TSV synthetic byte fixtures

A synthetic 0xE9 legacy payee is decoded only when Windows-1252 is explicitly chosen, while UTF-8 remains strict by default. UTF-8 and UTF-16 BOMs override unsupported manual interpretation by rejecting mismatch; undefined legacy control bytes, NUL, malformed financial rows and invalid signed amounts are rejected. A real Chrome fixture exercises explicit encoding selection, source-byte re-read, warning confirmation, exact payee/cents/leading-zero reference preservation, reset after changing encoding, and BOM conflict refusal. No real bank-issued sample or external QuickBooks import acceptance has been performed.

## V2.20 — Excel sep= bank CSV dialect fixtures

Synthetic Excel/CSV sources with a first-line `sep=;`, `sep=,` or `sep=<TAB>` directive validate that the directive is not counted as a transaction and that source physical row numbers, row identity and signed cents remain unchanged. Nonstandard bank preambles are deliberately not discarded. A first-header tie between comma and semicolon fails until explicitly selected. Test files with contradictory separator selections, malformed rows after multiline quoted payees, unrecognized directives and multiple directive lines reject the full source. Browser Chrome tests verify review acknowledgment and invalidation of stale exports. These are **not** bank-issued exports or actual accounting software imports.
