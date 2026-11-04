# Finance File Lab (CSV–QBO tool matrix)

A **browser-local financial file conversion site** developed from the user-provided [CSV/QBO V3.0 build specification](docs/PLAN-V3.md), with an audit trail of **250 unique US Semrush keywords** from DocuClipper and AccountingConverter.

**Repository owner:** `garrison2025/CSV-QBO` · **Deployment target:** Cloudflare Pages, no paid APIs.

## Current feature status

| Direction | Status | Important constraint |
|---|---|---|
| QBO/QFX/OFX → CSV and XLSX | Local reader working; synthetic tests | Standard bank STMTTRN entries; no investment feeds |
| QIF → CSV and XLSX | Local reader working; synthetic tests | Split/category structure not preserved |
| IIF → CSV and XLSX | Limited reader working; synthetic tests | Only TRNS summary; does not rebuild SPL accounting entries |
| CSV → QB Online-compatible 3-column CSV | Local formatter working | Not a `.qbo` Web Connect file; import not certified |
| CSV → QIF | Syntax export available for experimentation | Target application imports not verified |
| CSV / OFX / QFX → QBO | **Not implemented, no SEO route** | Requires legal FI metadata and real target application UAT |
| CSV → IIF | **Not implemented** | Requires supported Desktop transaction type and UAT |
| PDF → QBO | **Not implemented** | No OCR or paid API |
| Payments / user accounts / paid batch service | **Not implemented** | No fake subscription buttons |

**Critical distinction:** reading transaction data from a `.qbo` file ≠ generating a bank-compatible `.qbo` file. This code never claims a QuickBooks import was validated.

## V1.6 — OFX/QBO/QFX markup and bank-status integrity

- The local OFX parser distinguishes **genuine SGML/XML tags** from tag-like characters inside XML comments and `<![CDATA[...]]>` sections. It preserves CDATA as literal transaction text, while blanking markup-only views at matching offsets so that comments and descriptions cannot create phantom `STMTTRN` rows, extra `STATUS` blocks, false currencies or fake account sections.
- OFX bank `STATUS` blocks now must be properly paired; nested, unclosed and unexpected closing tags fail closed. An explicit `STATUS` without a `CODE` is rejected; bank-side nonzero status codes and severity `ERROR` remain hard failures.
- XML-declared feeds with missing closing tags for referenced transaction fields now fail rather than interpreting a truncated value. Legacy OFX 1.x SGML leaf fields without explicit closers remain supported.
- Automated tests cover adversarial comment/CDATA tokens, unclosed bank statuses, XML leaf syntax, status-code failures, and unchanged good-data output. Real Chrome acceptance uploads a synthetic XML source with fake transaction and script-looking text inside CDATA, confirms exactly **one** bank row and safe text-only DOM rendering, then downloads and checks the CSV.
- No external XML network parsing, paid API, server-side financial upload or `.qbo` writer was added. Original financial amounts remain signed as supplied; software import acceptance is not certified. Preview remains noindex.

## V1.5 — QuickBooks CSV ordered transaction reconciliation

- Manual QuickBooks Online CSV export now validates **every serialized row** against the exact originating source entry, not just aggregate debit/credit totals or row counts. The preflight checks original row ordering, formatted US dates, exact two-decimal signed amounts and full escaped descriptions, including embedded quotes, non-ASCII text, line breaks and formula-protection apostrophes.
- Both the single-file CSV and split ZIP paths run this preflight before download. Altered payee text, swapped rows/dates, missing/extra rows or lost formula-safety prefixes cause an explicit failure. No transaction data or reference IDs are disclosed in errors or validation summaries.
- `quickbooks-csv-validation.json` upgraded to v2. It contains safe **source row ordinal ranges**, an `orderedRowsReconciled` flag per part and aggregate reconciliation flags; never contains payee strings, check numbers or original source filenames.
- CI now runs a real Chrome acceptance test generating **1,001 synthetic CSV rows**, actually downloading the two-part QuickBooks ZIP, inspecting both file contents and private preflight v2 report. Unit tests additionally attempt to tamper with descriptions/dates/record order while retaining source totals.
- This is **local data integrity and CSV format verification only**, not acceptance by QuickBooks Online. No `.qbo` Web Connect writer, banking login, paid API or domain-launch change.

## V1.4 — verified real Chrome file workflows and memory-efficient ZIP exports

- New **real Google Chrome/Playwright Core E2E acceptance** runs in GitHub Actions after the existing financial, build and SEO gates. It starts a local HTTP server against the generated `dist/`, uses **synthetic transactions only**, clicks actual file pickers and buttons, and downloads and inspects actual CSV, XLSX and batch ZIP artifacts.
- Browser test coverage: CSV mapping and preflight, stale-mapping invalidation, duplicate warning acknowledgement, clear workspace, QBO-source Excel workbook, batch QIF overlap/ZIP, Windows-1252 OFX file decoding and CSV download, CSV-to-QIF syntax export, a 390px responsive viewport without horizontal overflow, and privacy-minimized reports. No browser JavaScript exceptions observed in passing CI.
- The stored-ZIP writer uses pre-sized `Uint8Array` / `DataView` buffers with a lookup-table CRC32 rather than copying millions of boxed JavaScript array elements. This reduces peak memory pressure for larger single-file Excel and multi-file ZIP exports without adding a compression dependency.
- Automated ZIP regression includes a **10 MiB** CSV payload plus multi-entry, UTF-8 and central-directory offset validation. This is a **synthetic file-size test**, not a real bank or real QuickBooks import.
- GitHub CI: [v1.4 browser + ZIP validation run](https://github.com/garrison2025/CSV-QBO/actions/runs/41810408569) completed with **334 passing Node tests**, Chrome E2E passing and noindex build passing.
- Run locally: `npm run check`, then install Playwright Core only if browser acceptance is needed (`npm install --no-save --no-package-lock playwright-core@1.55.0`) and run `npm run test:browser` with Google Chrome installed. There are **no production npm dependencies**, paid APIs or banking uploads.
- Preview Pages URLs remain `noindex`; actual bank compatibility, QuickBooks Desktop/Online import acceptance, Lighthouse and production SEO release are separate unfinished gates.

## V1.3 — QIF field integrity and batch cross-file overlap review

- QIF Bank/CCard/Cash reader now rejects duplicate date, signed amount, payee, memo or reference fields before they can overwrite transaction data. Repeated `!Type:` sections, unknown QIF record codes, and metadata-only or incomplete records fail closed.
- For supported redundant QIF `U` amount fields, the value must match `T` in exact integer cents. Mismatches block conversion rather than changing balances. Cleared-state, flags, addresses, categories and splits that cannot be preserved in CSV/Excel summaries generate explicit lossy warnings.
- Batch ZIP continues to export **one separate file per input**. It now identifies matching transaction IDs and matching date/amount/description fingerprints across *earlier files*, reporting only counts and earlier **file sequence numbers**. Different bank accounts may reuse reference IDs or transactions; matches are warnings, never automatic deduplication, merging or proof of fraud.
- The batch parser now optionally accepts the source file's original byte length. Browser-local batch upload provides `File.size` so Windows-1252 decoded content is not miscounted as a larger UTF-8 source when enforcing 8 MB per file / 12 MB total.
- JSON validation reports remain local and exclude original filenames, transaction descriptions and reference values. Source-file processing and ZIP generation require no paid APIs or accounts.
- Added negative QIF parsing, cross-file overlap, missing data and original-byte tests; real QuickBooks import and external bank acceptance remain unverified. Pages preview remains noindex.

## V1.2 — current CSV mapping controls the only exportable preview

- Fixed a potentially dangerous stale-data state: once a CSV/TSV mapping select changes, the previous transaction preview, audit, warning acknowledgement, validation summary and export readiness are invalidated together. Users must click **Preview transactions** again.
- Changing date interpretation or clearing the workspace invalidates those same controls. A mapping that fails validation cannot leave the last successful summary available for download.
- Validation JSON is disabled until a fresh, current preview passes; the on-screen transaction table and prior totals are cleared when the source interpretation changes.
- Added dependency-free simulated-DOM event tests (not a claim of manual live-browser UAT) for valid/invalid remapping, changing date order, duplicate warning acknowledgement resets and clearing an in-progress file read.
- Import into QuickBooks and real-bank compatibility remain unverified. All files stay local, previews stay noindex, and no paid dependencies or APIs were added.

## V1.1 — OFX bank retrieval boundaries and posting-date transparency

- `BANKTRANLIST` aggregates are checked for exactly one complete, non-repeated bank statement period; truncated, repeated or reversed `DTSTART`/`DTEND` sources fail clearly instead of merging entries.
- Transaction records outside an explicitly declared BANKTRANLIST are blocked. Valid bank transaction records are never removed based on date alone.
- OFX `DTSTART` is an inclusive retrieval start and `DTEND` is an exclusive retrieval end; those fields describe the bank's **search window**, not a guaranteed range for each transaction's `DTPOSTED` (posted) date. The OFX 2.2 specification explicitly permits older posting dates for recently-added transactions.
- A complete date-only retrieval window and conservative posted-date exception counts are preserved in the local parser integrity summary and privacy-minimized batch report. Exceptions warn but never alter the original signed amounts or delete rows.
- The workspace preview displays bank retrieval dates and posted-date exception counts separately from the actual transaction list; the compatibility page describes the distinction.
- Synthetic SGML, XML and Windows-1252 samples now include proper bank retrieval boundaries; additional tests reject partial/multiple lists and preserve late-posted rows.
- Live QuickBooks or bank-specific UAT remains **NOT RUN**; Cloudflare Pages previews remain noindex and no paid API is used.

Reference: [OFX 2.2 specification, date start/end semantics](https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%202.2.pdf).

## V1.0 — OFX/QBO/QFX variant reading with guarded bank field extraction

- `decodeFinancialBytes` decodes financial input bytes locally: default strict UTF-8, UTF-16 LE/BE with BOM, and OFX 1.x with explicit `CHARSET:1252` Windows-1252. Unsupported declared charsets and damaged bytes fail instead of replacing payee names silently.
- Browser single-file and multi-file paths now read actual bytes (`arrayBuffer`) before interpreting text; older Windows-1252 OFX files are decoded without uploading transactions or adding paid APIs.
- The OFX reader now supports ordinary SGML leaf tags, XML leaf tags, CDATA names and decimal/hex numeric character entities; it skips complete XML comments and refuses malformed comments, duplicate transaction fields and incomplete CDATA.
- Server-side OFX response status errors block output even when a stale STMTTRN appears in the file. Missing FITID or TRNTYPE produces explicit warnings and privacy-safe parser integrity counts rather than made-up identifiers.
- Transaction values preserve the OFX `TRNAMT` sign as-is. `TRNTYPE` labels are not used to infer or invert amounts.
- Added separate synthetic XML and Windows-1252 OFX fixtures linked from OFX converter pages; both contain exactly two transactions and a USD 107.50 net total.
- This release expands synthetic compatibility, **not** real-bank / QuickBooks application certification. `.qbo` writing, payments and indexing of the temporary Pages URL remain disabled.

## V0.9 — QuickBooks Online CSV preflight and explicit risk review

- `quickBooksCSVExportPlan` **reparses each generated CSV part** and reconciles its row count, exact USD cents, date coverage and UTF-8 file bytes to the original transactions. This is strictly a local *syntactic and arithmetic* preflight, not a QuickBooks Online import acceptance test.
- Enforces at most 1,000 rows / 350,000 bytes per QuickBooks CSV part. When an export splits into multiple files, its ZIP now includes `quickbooks-csv-validation.json` with per-part counts, byte sizes, date ranges and aggregate debit/credit/net totals. No transaction descriptions, references, account IDs or source filenames are included in that manifest.
- Duplicate transactions are **not** removed. In the single-file workspace, **any source format or duplicate warnings require explicit acknowledgement** before the export button can be used.
- Spreadsheet-formula-like descriptions are prefixed with an apostrophe for CSV exports; the converter warns users and includes an aggregate count in the local validation reports, because this protective prefix can alter displayed description text.
- QuickBooks Online manual CSV import remains a three-column `Date,Description,Amount` workflow; this software **does not produce `.qbo` Web Connect files**, connect bank accounts or claim successful import acceptance.
- Cloudflare Pages remains a `noindex,nofollow` technical preview. No paid APIs or accounts have been introduced.

## V0.8 — balanced IIF group validation and auditable file summaries

- IIF read-only parsing now requires complete `!TRNS`/`!SPL`-typed journal groups closed by `ENDTRNS`; it verifies each TRNS amount plus its SPL legs sums to zero using integer cents. Orphan SPLs, incomplete groups and imbalanced entries block the entire conversion.
- CSV and Excel exports contain **TRNS summary rows only**. SPL allocations, chart of accounts and ledger relationships are **not** exported or reconstructed. An IIF summary must never be presented as a certified bank feed, full accounting migration or QuickBooks-importable file.
- Single-file and batch validation JSON now includes source-specific `parserIntegrity` counters for IIF, date coverage and explicit non-ledger scope; it does not include original filenames, accounts, memos or transaction descriptions.
- Updated synthetic IIF test sample has two correctly balanced TRNS/SPL/ENDTRNS groups. New negative test fixtures verify rejection of malformed, missing and unbalanced groups.
- Preview site remains `noindex`; no real QuickBooks Desktop/Online import UAT has been performed.

## V0.7 — safe OFX/QIF bank record boundaries

- OFX/QBO/QFX reading now rejects truncated/nested `STMTTRN` aggregates and source rows without NAME or MEMO, rather than silently outputting misleading partial transactions.
- OFX compact timestamps must contain valid clock components and supported timezone suffixes; invalid suffixes cannot be silently treated as dates.
- QIF reader requires one explicit `!Type:Bank`, `!Type:CCard` or `!Type:Cash` transaction section. Unknown categories, investment, account lists or mixed transaction types are blocked; category/split details are **reported as lossy**, not preserved.
- QIF output retains available `N` check/reference field alongside memo. Import behavior remains **not verified** in a target application.
- Amount parser rejects internal spacing instead of erasing it, while keeping V0.6.1's **USD-only** guard.
- The earlier batch/single-file stale-read protection, full reset, CSV NUL and XLSX control-character validation are retained without replacement.
- The project remains **noindex** on Cloudflare Pages and has no approved `.qbo` Web Connect writer, payment system or real QuickBooks UAT.

## V0.6.1 — currency integrity, encoding and local state cleanup

- Financial amounts are handled as USD cents: reject explicit EUR/GBP/JPY/INR symbols and non-USD OFX currency declarations. Undeclared OFX currencies show a warning; **no exchange-rate conversion** is performed.
- Reject CSV null bytes and XLSX-invalid XML control characters instead of risking silent corruption.
- Detect replacement characters in browser-read file text; users can re-export as UTF-8 rather than convert an already damaged description.
- Prevent delayed single/batch file reads from overwriting a newer selection. **Clear workspace** now discards both single-file state and pending/generated batch ZIPs.
- Retain all V0.6 synthetic fixtures, guarded mapping, and existing batch workflows. Actual QuickBooks import UAT remains **NOT RUN**.

## V0.6 — harden CSV input and provide safe interactive fixtures

- Reject malformed CSV quoting or inconsistent row widths before any conversion; no silent field or amount shifts.
- Enforce unambiguous column mappings: signed Amount **or** separate Debit and Credit, never both; refuse duplicate column assignments.
- Download local synthetic examples for all six reader input formats. QBO and QFX examples exercise reading only and are not bank-issued or certified for accounting imports.
- Clear selected file and transaction preview in memory with one click; previously downloaded files and opted-in mapping templates remain under the user's control.
- The V0.5 independent-file batch ZIP workflow remains intact. No paid SaaS or .qbo writer is represented as complete.

## V0.5 — separate browser-local batch export

- Select up to **10 independent QBO/QFX/OFX/QIF/IIF bank files** (12 MB aggregate), and download a ZIP with a separately converted CSV or XLSX per input plus a validation report.
- Refuse to merge accounts, drop failed source records or silently delete duplicate transactions. Any invalid source blocks the entire ZIP.
- ZIP file names and the validation report do not include original bank filenames or account identifiers. The report includes financial totals and remains local.
- CSV batch import requires individual field mapping and is deliberately unsupported here. QBO Web Connect writing is not implemented.
- Warnings require explicit review acknowledgment before download. Real QuickBooks imports are still unverified.

## V0.4 correctness improvements

- OFX multi-account files are rejected instead of mixing transactions across bank/card accounts.
- Investment OFX/QIF inputs are explicitly rejected; this is a bank-transaction reader only.
- A visible source date-order control for CSV, QIF and IIF permits deliberate US/day-first selection and revalidates the preview when changed.
- 254 deterministic tests passed locally; no target-software import validation claimed.

## V0.3 workflow extension

Includes auto-batched QuickBooks Online CSV (not QBO), duplicate auditing, opt-in local column templates and anonymized validation reports. 254 deterministic checks pass. Real application import compatibility remains unverified.

## Run locally

Node.js 20+ is required; no npm dependencies or paid API keys.

```bash
npm test
npm run build
```

Open `dist/index.html` through a local static HTTP server (`python -m http.server 4173 -d dist`), or use your preferred local preview server. The build output is in `dist/`.

## Cloudflare Pages

- Framework: **None**
- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `22` (or any supported Node >=20)
- Preview deployment: **noindex and robots disallow** by design; do not submit preview URL to Search Console.
- When a custom production domain is purchased, set `SITE_URL=https://your-owned-domain.example` and `PUBLISH_SEO=true` **only after QA gates and review**. The production build will create canonicals and sitemap entries only for genuine, tested, nonbrand KD≤29 tool pages.

The sample domain above is a placeholder, not an owned URL. No domain or payment provider is configured in this repository.

## SEO assets

- [250 keyword records, including Semrush US Volume, KD, CPC, competitor, route/decision](data/keywords-250.json)
- [27-route planned SEO/QA registry from V3](data/seo-plan-v3.json)
- [Actual implemented tools and keywords](data/tools.json)
- [Owner-provided V3 implementation specification, including full keyword appendix](docs/PLAN-V3.md)
- [SEO and release decision notes](docs/SEO-RELEASE.md)

**250 researched keywords and 27 proposed routes are not 250 or 27 launched pages.** 12 tool routes are present in technical preview, but only read-only formats with explicit keyword evidence may ever enter a production sitemap after real QA. Unimplemented QBO-writing routes are intentionally absent.

## Privacy, limitations, and test evidence

All file reads and transformation occur in the browser. The code contains no endpoint to upload source financial files, no bank login and no analytics collecting transaction content. Export calculations use integer cents to avoid floating-point aggregation errors. Input is restricted to 8 MB; anomalous dates and amounts fail loudly.

`npm test` runs unit, property-style and static build gates. The separate Chrome acceptance script `npm run test:browser` is exercised in GitHub Actions using **synthetic financial records**. These real-browser tests do **not** substitute for real-bank sample testing, QuickBooks Online/Desktop import UAT, mobile accessibility review or a security audit. Consult [docs/RELEASE-EVIDENCE.md](docs/RELEASE-EVIDENCE.md).

> Independent utility. Not affiliated with Intuit, QuickBooks, Quicken, or a bank. Financial source files should be backed up; verify imports with the receiving application.
