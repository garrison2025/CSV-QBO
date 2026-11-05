## V2.17 — balance-to-statement provenance checks and date diagnostics (2026-11-05)

- OFX `LEDGERBAL`/`AVAILBAL` elements are now accepted **only when they structurally belong to one complete `STMTRS` or `CCSTMTRS` response that contains its own complete `BANKTRANLIST`**. Balance blocks outside the account response, in unrelated top-level markup, in a missing/incomplete response, or incorrectly nested inside `BANKTRANLIST` now reject the entire source instead of being falsely attributed to the transactions being exported.
- The report contains `balanceReview.statementScoped` (a structural validation boolean, *not* bank identity authentication). Original bank balance values are still neither retained nor included in local JSON/ZIP summaries.
- When bank-supplied transaction posting dates fall **after** the reported ledger `DTASOF` calendar date, `postedAfterLedgerAsOfCount` and a dedicated user-facing warning disclose the mismatch. This is a **review observation only**, not proof of error, and signed amounts/record order are preserved. Bank retrieval windows and posted dates can differ legitimately.
- Empty balance metadata produces no redundant balance callout. Changing the input clears all previous balance status, preview and export authorization. Tests cover synthetic orphan/misnested/nested SGML/XML data, later postings and real Chrome flow.
- **Important:** valid bank balance metadata, bank account structural context and user acknowledgment do not prove original bank-issued file authenticity, complete posting history, independent reconciliation or downstream QuickBooks acceptance. Those UAT counts remain zero. SEO remains noindex until real validation and an approved domain.

## V2.16 — bank-reported OFX balances as unverified metadata (2026-11-05)

- OFX/QBO/QFX read-only import now explicitly inspects optional `LEDGERBAL` (ledger balance) and `AVAILBAL` (available balance) aggregates in both OFX 1.x SGML and OFX 2.x XML, validating their `BALAMT` as exact signed USD cents and their `DTASOF` as a real calendar date. Empty fields, duplicate/truncated balance blocks, impossible dates or malformed amounts **block** the whole source instead of silently discarding malformed financial metadata.
- Original bank balance *amounts* are validated in the local browser and immediately discarded: the preview/validation JSON records only balance presence, bank-reported as-of dates and `independentReconciliationPerformed:false`. It never publishes bank balances, account identifiers or calculated opening balances.
- A warning and visible note distinguish **bank-provided closing/available balance metadata** from true financial reconciliation. The sum of the available `STMTTRN` records cannot independently establish the bank's opening balance, complete posting history or exact closing ledger value. No fake "balanced" result is emitted.
- Ordinary OFX without optional balance elements remains supported; its review explicitly states no balances were supplied. Any change of source file clears old balance preview state and previous download permission.
- Added independent synthetic OFX SGML/XML data, damaged-balance and inert comment/CDATA fixtures, batch privacy tests and a real Chrome upload/report/CSV/download/refusal acceptance path.
- Real bank-issued source evidence remains **0**, target QuickBooks import tests remain **0**. Preview retains `noindex,nofollow`; no bank compatibility certification is claimed.

## V2.15 — account-scoped OFX FITID collision integrity (2026-11-05)

- **Banking specification grounding:** The [OFX 2.2 specification §3.2.3](https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%202.2.pdf) defines `FITID` as a transaction identifier unique **within an account**, primarily used to detect duplicate responses. The converter does not assume identifiers are globally unique across different accounts or institutions.
- When two `STMTTRN` records in **one statement file** share a FITID but have **different posted dates, signed amounts, descriptions, Memo values or TRNTYPE**, the entire source is rejected, not partially exported. The error identifies source row numbers but does not print the FITID, account number or transaction text.
- When the repeated FITID's exported data is **identical**, all original rows remain intact but an aggregate warning is shown, requiring explicit review before download. The reader never automatically deletes transactions, guesses corrections, or claims which record should be imported.
- Multiple real `BANKACCTFROM` / `CCACCTFROM` markers are rejected even if a damaged source contains only one `STMTRS` wrapper. Fake account/FITID tags inside XML comments or CDATA are ignored as document data.
- In **separate-file batch** workflows, the same FITID across different inputs is a possible overlap, **not a definitive collision**: account identities cannot be validated from a private CSV report. Output files remain separate; cross-file reference matches are warnings only.
- A downloaded BANKTRANLIST alone does not prove **all historical transactions** were returned or that transactions sum to LEDGERBAL; beginning balances, bank-side retrieval history and real import results are unavailable.
- Added synthetic OFX 1.x/2.x Node tests and real Chrome upload/download tests of identical vs conflicting FITIDs, mixed account markers, privacy-safe validation and intact cents. **Authentic bank UAT = 0; actual QuickBooks target imports = 0.** Preview stays noindex.

## V2.14 — OFX/QFX/QBO corrections, sign consistency, time zone bounds (2026-11-05)

- **Fail closed on correction instructions.** The OFX statement specification defines `CORRECTFITID` and `CORRECTACTION` (`REPLACE`/`DELETE`) as updates to a *previously sent transaction*. Since this local stateless CSV reader has no prior FITID/transaction history, it cannot safely apply a deletion or replacement. It now rejects the entire source if either correction element appears inside a real STMTTRN (including empty/unknown variants) instead of misrepresenting the corrected record as a fresh transaction. Error reports mention only the ordinal source row and syntax, **never** the corrected FITID.
- Signed `TRNAMT` values remain exactly as the source provides. Explicit `TRNTYPE=DEBIT` with positive amounts or `CREDIT` with negative amounts get an aggregate warning and require acknowledgment. No automatic sign flip, deduplication or classification is performed.
- OFX datetime GMT offsets are checked against the specification's ±12-hour bounds; known fractional offsets (e.g. `[-5.5:EST]`) are parsed. Output is still the bank's supplied local calendar posting date, not a guessed conversion to UTC or the user's computer time zone.
- Synthetic OFX 1.x SGML and 2.x XML Node regression tests and Chrome upload/download tests cover corrections, CDATA/comment safety, signs, exact cents and offset edge cases.
- This is a **local output correctness protection**, not authenticated real-bank source validation or QuickBooks import certification. Verified genuine bank UAT and actual QuickBooks manual uploads remain zero; Pages preview stays noindex.

## V2.13 — numeric date ambiguity and abnormal amount preflight (2026-11-05)

- CSV numeric dates that are **valid calendar days in both MM/DD/YYYY and DD/MM/YYYY but yield different dates** now trigger an explicit warning and disable download until review. The current selected order (US/day-first) is preserved, never auto-guessed, and any date-order change clears the previous preview/download permission. Invalid calendar dates still fail.
- Rows with both Debit and Credit columns entirely blank are **rejected** instead of silently turned into a financial zero. Explicit zero values remain valid but flagged for review and target application acceptance.
- Independently and without modifying input, the parser flags exactly zero amounts and absolute values at or above **USD 1,000,000** for manual review. The latter is a transparent conservative **review heuristic**, not an amount limit; legitimate large transactions remain downloadable after acknowledgment.
- Downloadable local validation summaries and QuickBooks multi-part ZIP reports contain only aggregate risk counts, never transaction values or descriptions. Node and Chrome automated regression tests check US/EU previews, date-change invalidation, strict amount omissions and exact data preservation.
- The site remains noindex until authentic bank samples and target imports are independently verified. This is source-format preflight, not proof of QuickBooks import success.

## V2.12 — safer CSV field mapping and accurate signed-amount labels (2026-11-05)

- The converter recognizes a specific high-risk bank CSV layout: selected Payee/Description is completely blank but Memo has a description on **every** populated transaction row. The site recommends an **explicit, one-click** Memo → Description mapping change, clears the duplicate Memo selection, and requires a new preview; it never silently changes transaction data or signs.
- Multiple date headers (Transaction Date / Post Date) now trigger a visible date-column review note; additional common source header spellings are recognized, including `Trans. Date`, `Post Date` and `Check or Slip #`. Raw credit-card account-number columns are never mapped as transaction references.
- Summary labels use **Negative total** / **Positive total** instead of implying that all positive transactions are cash inflows. Credit-card charge/payback polarity can differ from bank checking files; the converter preserves original signed cents and asks operators to verify their destination account before any import.
- New external fictional bank-format regression tests and Chrome E2E cover the actual mapping suggestion, export inhibition until preview, dates, amounts and privacy-safe guidance.
- No authentic bank issuer export or QuickBooks manual import is represented by these synthetic/externally authored fixtures; real bank/import UAT remains **0**, and site indexing stays off.

## V2.11 — complete offline output-file verification: XLSX and split QuickBooks CSV ZIP

- The private cross-file checker now inspects the **actual XLSX bytes** for the five read-only Excel routes; an independent ZIP/XML inspector checks exact row order, native Excel date serials and styles, description, signed cents, reference IDs, optional Memo, worksheet metadata, and inert text.
- QuickBooks ZIP output containing multiple three-column CSV parts is independently inspected and compared to the original source. Missing/extra/renamed parts, changed transactions or mismatched packaged validation JSON abort the audit. It remains a manual-upload CSV, never `.qbo`.
- This is technical output integrity and **not** proof of genuine bank-file provenance or Excel/QuickBooks target-import acceptance. No actual bank originals or accounting apps were accessed, and public UAT remains 0.
- New read-only script: [scripts/uat-archive-inspect.mjs](scripts/uat-archive-inspect.mjs); updated [real-file UAT instructions](docs/REAL-BANK-UAT.md).

## V2.10 — independent external bank-style sample checks (2026-11-05)

- Added an independently authored, Apache-2.0 licensed fictional fixture dataset with 6 bank-shaped CSV files + 1 Quicken QIF; tests independently pin expected counts and signed totals and exercise real Chrome upload/preview/download.
- Fixed a real QIF interoperability limitation: explicitly marked `month/day'YY` dates now parse as 20YY with a user-visible warning. Ambiguous slash-separated 2-digit years still reject instead of guessing.
- Wells Fargo-style fictional CSV has empty Payee with descriptions in Memo. Correct conversion requires explicit Memo → Description mapping. American Express and Discover-style credit-card exports have opposite polarity conventions from checking accounts; no blind sign reversal or target-app compatibility claim.
- Detailed evidence and provenance: [docs/INDEPENDENT-SAMPLE-VERIFICATION.md](docs/INDEPENDENT-SAMPLE-VERIFICATION.md).
- **Still 0 authentic bank-export acceptance cases and 0 target QuickBooks import observations.** External fictional files do not count as genuine bank compatibility evidence and do not enable SEO publishing.

## V2.9 — evidence-backed publication gate and correct QuickBooks target UAT (2026-11-05)

- Discovered an important target-test restriction from Intuit: **QuickBooks Online Developer Sandbox cannot import or export data files**. The Test Drive demo does not establish a real manual banking import. Genuine CSV target acceptance requires an authorized upload-capable company or trial and recorded QuickBooks UI result; zero such imports have been performed.
- Added [real QuickBooks import UAT worksheet](docs/QUICKBOOKS-REAL-IMPORT-UAT.md) and corrected the [real-bank acceptance protocol](docs/REAL-BANK-UAT.md) and compatibility page.
- Hardened SEO release: custom domain + `PUBLISH_SEO=true` alone are **insufficient**. Publishing now requires approved `data/production-release.json` AND matching reviewed real-bank UAT cases for each route; KD must be <=29 and direction must be a tested read-only tool. The release config starts unapproved and keeps all pages noindex, with no production sitemap.
- Source bank originals, signed cent totals, sensitive hashes and screenshots remain private. Public reviewed evidence alone is NOT third-party certification.

## V2.8 — local reconciliation of actual bank source and downloaded output (2026-11-05)

- Added `scripts/uat-local-check.mjs`: a local-only preflight comparing **two separate files** (original bank export and actual downloaded output), without uploading either to a server.
- Supports QBO/QFX/OFX/QIF/IIF → generic CSV, CSV → QuickBooks Online 3-column CSV (single output), and CSV → QIF. Exactly compares supported rows, order, dates, cents and representable text, and privately fingerprints both file bytes with SHA-256.
- Rejects missing explicit CSV mappings, data/sign/row mismatches, lost Memo fields in generic CSV, and unsupported XLSX/multi-part files. Independent bank balances can be supplied but are never guessed.
- Produces an intentionally UNAPPROVED private UAT draft. This is **not** evidence of an actual bank-issued file or a QuickBooks/Quicken import; human review of the genuine original and manual import remain mandatory.
- Instructions: [docs/REAL-BANK-UAT.md](docs/REAL-BANK-UAT.md) and [manifest example](docs/local-preflight-manifest.example.json). Bank files, private manifest, hash, aggregate figures, and screenshots must be outside the Git repository.
- Actual real-bank acceptance and QuickBooks target imports remain **0**. Preview site continues noindex; no Web Connect .qbo writer, IIF writer, payments, or expensive API.

## V2.7 — real-bank and QuickBooks import acceptance evidence (2026-11-05)

- Added the documented real-bank UAT and QuickBooks Online/Quicken test procedure in [docs/REAL-BANK-UAT.md](docs/REAL-BANK-UAT.md). This is a **manual, private-first** evidence requirement, not another claim of simulated compatibility.
- Each acceptance case links authorized source provenance, original/converted file SHA-256, a specific banking-export dialect, parser commit, exact row and signed-cent comparisons, and (only for target-import paths) real destination app/version/account testing and repeated-import observations.
- Validation CLI: `node scripts/uat-evidence.mjs check-private "<PRIVATE-UAT-JSON>"`, then `export-public` to produce the allow-listed public registry; `npm run uat:check-public` checks the public shape. The private original, hash, merchant details, account IDs, screenshots and reconciliation amounts remain outside GitHub.
- The built [/compatibility/](https://csv-qbo.pages.dev/compatibility/) page reads approved cases from `data/uat-public.json`; **there are currently ZERO real-bank/QuickBooks cases**. Build and CI reject malformed or incorrectly scoped evidence, but cannot independently prove the reality of a bank export or a QuickBooks UI result. Owner review of private proof is mandatory.
- QBO Web Connect writer, IIF writer, bank-specific guarantees, paid features and production indexing remain **blocked**. Preview remains noindex.

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

## V2.6 — reject contradictory accounting money signs rather than reverse cashflow

- Fixed a shared financial-amount parser defect: `(-12.34)` or `(-$12.34)` previously canceled two negative indicators and silently became a **positive** transaction. This could reverse the debit/credit meaning in CSV, QIF, OFX/QBO/QFX or IIF conversions.
- Only **one** negative convention is permitted per value: an ordinary leading minus (`-12.34`, `-$1,234.50`) **or** accounting parentheses (`(12.34)`, `($1,234.50)`). Existing positive values, leading `+` and recognized $-prefix formatting remain supported; contradictory combinations such as `(-12.34)`, `($-12.34)`, `-+12.34` and `$-12.34` now fail closed rather than being silently normalized.
- The checks run through the shared exact signed-integer-cent parser, across all supported bank formats and batch files. A single malformed source blocks its download or the whole batch ZIP, without exposing merchant names or transaction references in the new sign-error text.
- Synthetic Node regressions cover valid parenthesized debits, malformed signs across CSV/QIF/OFX/IIF, and all-or-nothing batch archives. Chrome E2E verifies a normal parenthesized debit downloads as a negative CSV amount and a mixed-sign QIF file disables previous preview/download.
- All 12 converter pages disclose this rule; financial data stays in the browser, no paid APIs, no invented currency exchange and no external QuickBooks acceptance claims. `csv-qbo.pages.dev` remains a `noindex,nofollow` technical preview.

## V2.5 — exact IIF field-width and dual-amount reconciliation

- **Fixed silent extra-field loss:** the IIF reader previously matched `TRNS`/`SPL` fields by the declared `!TRNS`/`!SPL` headers but silently ignored any extra tab-separated cells. The reader now rejects any transaction-row field count that differs from its declared header (including unexpectedly short rows), as well as `ENDTRNS` lines with additional cells. Empty/duplicate header names also fail closed.
- **Fixed ambiguous signed money:** when IIF source headers declare both `AMOUNT` and `AMT`, the reader now parses both into exact signed integer cents and requires equality. Contradictory values reject the source, instead of silently choosing one amount. Files with only `AMOUNT`, only `AMT`, or one populated alias alongside an empty one remain supported.
- Existing zero-sum `TRNS`/`SPL` group validation, source ordering, reference IDs and report privacy remain intact. IIF still exports **checked TRNS summaries only**, not SPL allocations, not a reconstructed accounting ledger, and not a verified bank statement.
- Node regressions check extra/missing TRNS and SPL columns, mismatching dual-amount aliases, malformed ENDTRNS, header cardinality, fallback aliases, exact cents and all-or-nothing batch ZIP rejection. Real Chrome tests upload a valid dual-amount IIF and inspect XLSX money/ID cells, then verify invalid files disable previous previews/downloads with privacy-safe errors.
- Both IIF landing pages now disclose stricter schema validation. This is synthetic file-integrity testing rather than a real QuickBooks/Excel import acceptance. Free Cloudflare technical preview continues with `noindex,nofollow`.

## V2.4 — CSV source text fidelity and exact source-to-wire preflight

- **Fixed silent text loss in CSV import:** the older CSV/TSV importer trimmed outer spaces from merchant descriptions and reference IDs. Date and amount syntax still accepts surrounding whitespace, but Description, Reference and separately mapped Memo are now preserved **byte-for-byte at the decoded text level** (including quoted leading/trailing spaces and embedded quoted line breaks) through parsing and supported exports. Audit matching may normalize descriptions for duplicate detection without modifying the exported row.
- **Added generic CSV export preflight:** both single-file and separate-file batch CSV downloads call `genericCSVExportPlan`. The generated CSV is encoded to UTF-8 and reparsed before returning a download; every source row is reconciled in **original order** against ISO date, canonical signed integer-cent amount, complete merchant/payee, reference ID and optional Memo. Spreadsheet formula-guard apostrophes are the sole permitted text transformation; missing or extra rows, shuffled cells, altered descriptions, removed guards, invalid quote structure, NUL and lossy Unicode encoding fail closed.
- **Private validation metadata:** `validateGenericCSVExport` returns only row and column counts, boolean order/text/amount reconciliation flags, memo-included/omitted row counts and formula-guarded cell count. Errors include at most a source row number and field name, never bank values, filenames or merchant IDs.
- **Compatibility:** existing 4-column generic CSV and opt-in 5-column CSV structures remain unchanged; QuickBooks manual-upload CSV continues to use its distinct 3-column source reconciliation and is not altered. Excel, QIF and batch source accounts are untouched.
- **Evidence:** Node tests cover tampered rows with unchanged net totals, text/id/date/memo/amount reorder mismatches, whitespace preservation, formula-safe cells, 1,200-row UTF-8/multiline sources, invalid Unicode, and batch ZIP privacy. Real Chrome uploads synthetic QIF and quoted CSV, then verifies the exact returned CSV/QIF file strings. Preview remains `noindex,nofollow`; no paid API or server-side financial upload.

## V2.3 — optional independent Memo columns without changing QuickBooks three-column import

- Previously the generic CSV and XLSX export default contained only Date, Description, signed Amount and Reference. For QIF/OFX bank sources that also contain **independent Memo details**, this meant those details were silently excluded even though the parser had preserved them in memory.
- An **Include separate Memo column** checkbox now appears whenever the selected bank file has independent Memo values and the output is generic CSV or Excel. It is **off by default** to preserve the existing four-column output contract; when enabled, the exported file gains a fifth `memo` (CSV) or `Memo` (Excel) text column in source order. Excel Memo is inert inline text, not a formula; CSV Memo retains quotes and embedded line breaks and neutralizes spreadsheet-formula prefixes using the existing guard.
- QIF/QBO/QFX/OFX inputs show Memo in the preview and search results; CSV users can optionally map a separate Memo/Notes column. Where the sole `Memo` header is already the fallback Description, the same physical column is never auto-mapped twice. Mapping to the same source column twice remains an error.
- **QuickBooks Online CSV is unchanged and limited to exactly three columns** (Date, Description, Amount). If a source has independent Memo, the UI discloses that the QuickBooks upload will not contain it. No unsupported extra QBO field is introduced, and no real application import is claimed.
- **QIF export** uses M records for separate Memo from a mapped CSV source; multiline or control-character M values still fail closed per V1.9 rather than being silently flattened.
- Batch CSV/Excel ZIP generation includes its own opt-in Memo checkbox, privacy-safe per-file/aggregate Memo presence and omission counts, and a warning/acknowledgement gate if a four-column batch would omit Memo. Changing the batch preference invalidates previously generated ZIP and requires file re-selection; source accounts remain separate.
- Test coverage: source mapping, whitespace/quoted multiline Memo preservation, CSV injection prevention, true numeric Excel cents with optional E column, QIF Memo M records, QuickBooks three-column contract, ZIP omission counts, reset and source change. Real Chrome acceptance checks actual file downloads and UI disclosure. No paid services or server-side bank uploads; preview remains `noindex,nofollow`.

## V2.2 — correct OFX 2.x XML mixed-content and entity validation

- Fixed real source-to-export text-integrity hazards in OFX/QBO/QFX: XML leaf fields can contain **ordinary XML text, `<![CDATA[...]]>` segments, and XML comments in arbitrary order**. The old extractor could silently drop text after CDATA or leave comment markup inside a payee/memo. The new reader concatenates literal text and CDATA, omits comments and preserves the resulting merchant/reference/memo string without rewriting amounts or record order.
- OFX 2.x XML mode now fails closed on **unknown named references, case-invalid XML entity names, missing semicolons, bare ampersands, disallowed control codes, surrogates and illegal numeric character references**. Only supported named/numeric entities are decoded once; escaped ampersands stay literal after decoding. An invalid XML source blocks preview/export with an error that never echoes the original private transaction text.
- **Legacy OFX 1.x SGML is not forced through strict XML entity rules:** descriptions such as `Smith & Sons` still load, and SGML comment/CDATA segments are extracted without loss. No network XML resolver, DTD expansion or external parser is used.
- Node tests exercise mixed XML entity/CDATA/comment fragments, Unicode, invalid code points, lossless payee reconstruction, SGML raw ampersands and malformed markup. Real Chrome E2E uploads both a valid mixed XML feed (then downloads CSV) and an invalid XML entity feed (must not expose stale data or permit downloads).
- Six OFX/QFX/QBO conversion pages disclose the behavior. This proves only synthetic browser-local parsing; no real bank variant or QuickBooks import certification. Technical preview stays `noindex,nofollow` with zero paid APIs.

## V2.1 — old Mac CR-only QIF/IIF reader compatibility

- Fixed a verified parser boundary limitation: QIF and IIF read logic formerly split records only on `LF` and `CRLF`; classic Mac or old finance exports with **bare CR** separators would be rejected or combine independent financial records.
- Both QIF and IIF now accept `CR`, `LF`, `CRLF` and mixed records without changing signed amounts, dates, payees, references, source order, warnings or accounting-split rules. This changes **record boundaries only**, never financial fields.
- Strict validation remains mandatory: truncated QIF transactions still fail if the final `^` terminator is absent; IIF groups still must have complete `TRNS`/`SPL`/`ENDTRNS` records and exactly balanced integer-cent totals. Batch output still keeps source accounts in separate files and blocks the whole ZIP on any invalid file.
- Node coverage tests three-line-ending parity, 2+ account-like transactions, UTF-16LE BOM decoded QIF, zero-sum two-leg IIF journals and negative truncated-file cases. Chrome E2E uploads real **synthetic CR-only files** in QIF → XLSX and IIF → XLSX tools, checks every row and inspects the downloaded XLSX cells.
- The four QIF/IIF landing pages disclose supported line endings without claiming blanket compatibility with any banking provider or actual QuickBooks imports. Preview `noindex,nofollow` remains unchanged; no paid APIs or extra runtime dependencies.

## V2.0 — native Excel dates, validated numeric cents and independently verified OOXML

- **Fixed numeric cell typing:** XLSX Amount is always a signed numeric cell with a two-decimal number format. The writer validates each source amount through the shared integer-cent parser, canonicalizes to exactly two decimals and checks its binary numeric representation rounds back to the same cents before writing. Invalid/unsupported amounts now fail closed instead of silently becoming text.
- **Fixed date semantics:** XLSX Date is now a proper numeric date cell (Excel 1900 date system), displayed consistently as `yyyy-mm-dd`. The writer handles Excel's phantom 1900-02-29 serial-number offset while rejecting invalid source dates; text dates were previously unsuitable for native Excel date sorting/filtering. No timezone or time-of-day is invented.
- **Text safety:** Description and Reference remain literal inline strings (never formulas); leading zeros in IDs are preserved. XML-sensitive characters are escaped, CR is encoded as a numeric character reference to avoid XML newline normalization, and invalid/overlong Excel cell text is rejected without echoing private payee information in error messages.
- **Usability:** The generated worksheet freezes row one and includes a filterable Date/Description/Amount/Reference header. These are presentation-only changes; parsed financial records and sums are untouched.
- **Evidence:** New Node regressions check 1900/2000 date boundaries, 2026 serials, one-cent/large signed amounts, formula-looking descriptions, Unicode and XML escapes. Real Chrome downloads XLSX and inspects typed cells and styles. GitHub CI additionally validates a synthetic `.xlsx` using **independent Python standard-library ZIP + XML parsers**, including CRC, exact decimal payload and date/text styles (not proprietary Microsoft Excel acceptance).
- **Scope:** Browser-local, no paid APIs or production dependencies. Native `.qbo` writer and actual QuickBooks/Excel desktop application UAT remain outside the verified scope; technical preview stays `noindex,nofollow`.

## V1.9 — lossless QIF writer and source-row self-check

- Fixed a concrete loss-of-data issue in the experimental CSV → QIF writer: earlier versions replaced CR/LF and literal `^` characters in payees, references and memos with spaces without clearly telling the user. The writer now preserves safe literal `^` and Unicode and **rejects line breaks/control characters** with a row-specific error instead of changing transaction content.
- Before returning QIF bytes to any download, the writer reads its own generated Bank QIF back using the existing local parser and compares **every row in exact order**: ISO date, signed integer-cent amount, full description/payee, reference ID and memo. Missing, changed or extra rows cause an error. This is a **source-to-wire correctness check, not proof that an external finance app accepts QIF**.
- Added tests for literal carets, international payees, 1,200-row whole-file round trips, unsupported control characters and redacted error text. Chrome browser tests download a caret-containing synthetic QIF and attempt to export a quoted multiline CSV payee, which must fail safely without including private details in the error.
- Updated the CSV → QIF tool landing-page FAQ to state that multiline payees cannot be represented exactly and to distinguish QIF syntax verification from real-world import compatibility.
- No production dependencies, paid APIs, bank uploads or `.qbo` Web Connect writer. Cloudflare preview stays `noindex,nofollow` until an explicitly authorized production release.

## V1.8 — private full-file transaction search and review-only duplicate filtering

- A local search box on all 12 converter tools matches the full source file across date, description, signed amount and transaction reference, not merely the currently visible page. It is case-insensitive and preserves original source row indices for subsequent review.
- A **Show possible duplicates only** checkbox restricts the on-screen preview to rows already flagged by the existing duplicate-reference or matching date/amount/description audits. The existing **Next possible duplicate** control cycles only through matches currently displayed by these preview filters.
- Filtered results use the existing 25-row pagination; the UI states matching count versus full source transaction count, shows an explicit no-matches message, and makes clear that **downloads still include all source transactions**. Searching does not change the audit, warnings, acknowledgement state, totals or any CSV/XLSX/QIF/ZIP export.
- Query text, filter flags and matches stay in browser memory and are reset whenever users select another source file, change CSV mapping/date order or clear the workspace. Nothing is sent to servers or stored as a search history.
- Real Chrome E2E checks last-row searching across 1,001 synthetic transactions, no-match handling with full-file ZIP still intact, and duplicate-only results covering source rows 2 and 51 in a 52-row source. Simulated DOM tests cover reset, warning acknowledgement, filtered-page navigation and empty-state safety.
- No paid APIs or runtime dependencies added; site is still a noindex technical preview and real QuickBooks import acceptance is not verified.

## V1.7 — full paginated transaction review with duplicate navigation

- Replaced the previous **8-row-only preview** with a fully browsable **25-transaction-per-page** read-only table across all converter tools. Previous/Next controls show current page, precise displayed row range and full source transaction count.
- Rows involved in possible duplicate detection (duplicate transaction ID or matching date/amount/description) are visually marked **Possible duplicate**. A **Next possible duplicate** control cycles through flagged **original source row numbers**, even if the flagged transaction is on another page. These warnings never remove or mutate transactions.
- Navigation, duplicate focus and all visible previews reset whenever users select a new file, change CSV column mappings/date order, or click Clear workspace. The export and privacy-safe validation report are based on **all** source rows, never just the visible page.
- Real Chrome E2E drives 41 pages across **1,001 synthetic bank records**, verifies the final row is visible, and then checks the downloaded QuickBooks CSV ZIP still includes all 1,001 rows. Additional Chrome regression jumps to duplicate rows 2 and 51 of a 52-transaction file, preserving the warning-acknowledgement requirement.
- Page navigation only manipulates in-browser DOM text nodes; no bank data upload, new dependencies, auto-deduplication, or domain/SEO launch. No real QuickBooks import acceptance claimed.

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
- A custom domain plus `SITE_URL` and `PUBLISH_SEO=true` are NOT enough to enable SEO. An explicit owner publication approval AND matching genuine reviewed bank evidence for each KD≤29 tool slug are also required. See [docs/SEO-RELEASE.md](docs/SEO-RELEASE.md).

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
