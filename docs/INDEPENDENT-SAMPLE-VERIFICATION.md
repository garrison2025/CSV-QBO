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
