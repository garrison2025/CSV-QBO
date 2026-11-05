# Competitor-as-oracle experiment — AccountingConverter vs CSV-QBO (2026-11-05)

## Correct conclusion: a competitor is a useful black-box reference, NOT a QuickBooks test account

Original project V3 identifies two SEO/product reference sites: **AccountingConverter** and **DocuClipper**. They publish CSV → **.qbo Web Connect** converters. Our site currently offers a **QuickBooks Online three-column CSV manual-upload formatter**; it does NOT generate outgoing Web Connect .qbo files. Comparing the two output formats byte-for-byte or implying identical product functionality would be misleading.

A competitor's website claiming "QuickBooks import supported" is not independent evidence of the specific target QuickBooks installation, bank issuer, account type, import results, or duplicate behavior. Successful competitor conversion would support only the known **input → generated file** contract. To accept real QuickBooks compatibility, observed imported transactions inside an authorized actual QuickBooks company are still required.

### Source evidence
- [Original AccountingConverter CSV → QBO site](https://accountingconverter.com/tools/csv-to-qbo): free/no sign-up advertised, HTML upload form, describes QBO Web Connect output.
- [DocuClipper CSV → QBO](https://www.docuclipper.com/solutions/convert-csv-to-qbo/): describes CSV mapping and OFX-based Web Connect file with FITIDs; requires its own service workflow; vendor descriptions are not observed Intuit import results.
- [Official Intuit CSV manual upload specification](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US): supports a distinct three-column Date/Description/Amount format.
- See [Intuit UAT blocker audit](./INTUIT-REAL-IMPORT-UAT-BLOCKERS-20261105.md) for official Intuit sandbox no-import restriction and independent real Chrome demo security-verification blocker.

### Executed black-box synthetic comparison (NOT actual QuickBooks import)

| Probe fact | Independently observed |
|---|---|
| CI run | [41982899982](https://github.com/garrison2025/CSV-QBO/actions/runs/41982899982), Chrome on Ubuntu GitHub Actions |
| Competitor URL | https://accountingconverter.com/tools/csv-to-qbo |
| Source | Generated **fictional** CSV, 2 transactions, 10/14/2026 −12.50; 10/15/2026 +20.75 (signed net **+8.25 USD**) |
| Competitor landing page | Loaded normally, titled CSV to QBO Converter — Import into QuickBooks (FREE) |
| File input accepted by browser | Initial file selection succeeded; page afterward displayed the fictional filename |
| Competitor upload result | The visible page showed **“Forbidden”** after submission; it did not provide a QBO file download |
| Downloaded competitor .qbo bytes | **None observed** |
| Byte/semantic comparison against competitor QBO | **NOT RUN / no competitor file** |
| Our local transaction parse | 2 rows; same dates, signed amounts and +8.25 net; local three-column CSV preflight PASS |
| Real Intuit QuickBooks CSV upload | **NOT PERFORMED** |
| Bank-issued account-original acceptance | **NOT PERFORMED** |

The one-time probe recorded screenshot and sanitized JSON as [GitHub artifact](https://github.com/garrison2025/CSV-QBO/actions/runs/41982899982) (7-day retention). Code: [scripts/probe-accountingconverter-compare.mjs](../scripts/probe-accountingconverter-compare.mjs). A separate first attempt was run at [41982647011](https://github.com/garrison2025/CSV-QBO/actions/runs/41982647011); neither run returned a downloadable QBO. No real bank data, user login, payment credentials or bypass were used. External automation has been removed from recurring CI to avoid repeated requests and false availability claims.

The displayed **“Forbidden”** is not sufficient by itself to pinpoint HTTP status or the provider's exact cause. It is evidence only that **our nonauthenticated GitHub-runner attempt did not yield a convertible file**. It does not prove the tool is unavailable to users, defective, or untrustworthy.

## Compatibility evidence grades for the project

| Grade | Test | Acceptable claim |
|---|---|---|
| A — local invariant | Exact source rows, dates, cents; serialized CSV or OFX syntax | "Local synthetic parsing/formatting tests pass" |
| B — independent converter differential | The same fictional/authorized source is converted by our site and a third-party converter; both downloaded outputs are reverse-parsed and reconciled | "Independent converter outputs agree for these fixture cases" **only after observed downloads** |
| C — official format documentation | Intuit official format rules and independent examples | "Published specification/format conformance" |
| D — observed target software | Authorized QuickBooks company truly imports our generated CSV/QBO; operator checks row count, date, amounts, target account and duplicate behavior | "Actual QuickBooks import verified for named version/scenario" |
| E — authentic bank original | Bank-account-originated file authenticated, independent source ledger balance/row count, reviewer sign-off | "Bank-specific read compatibility for named issuer/export variant" |

A/B/C cannot substitute for D/E. Passing the competitor's conversion is neither proof that **our** differing-format output imports, nor proof that the competitor's own file was used in a genuine bank-account context.

## Practical launch decision

The site may pursue **Public Beta** for documented implemented read-only and QuickBooks-compatible manual CSV formatting as a *separate product release decision*. No external certification is required simply to publish a truthful functional page, but do not change any production or SEO approval gate based on the blocked differential probe. Never label `/tools/csv-to-qbo/` as an actual QBO writer until it generates real Web Connect files with legally sourced bank metadata and target-software acceptance. Current UAT registry remains **0 authentic bank originals and 0 observed QuickBooks imports**.
