# Release evidence log — 2026-11-04

| Gate | Status | Evidence / limitation |
|---|---|---|
| Source specification read | PASS | User-provided V3 including 250 keyword appendix |
| Internal financial precision | PASS, synthetic cases | Integer-cent amounts, strict date parser, CSV/QIF/OFX/IIF limited readers |
| Automated tests | PASS, GitHub CI | 334 Node tests pass (0 fail) in branch run 41810408569; noindex build gate passes |
| XLSX structural sample | PASS locally | .xlsx opened with openpyxl; numeric values and strings checked |
| SEO planned route gate | PASS locally | Preview noindex; blocked CSV->QBO route absent; 250 keywords retained |
| Real QuickBooks Online/Desktop import | **NOT RUN / BLOCKER** | No user-provided target test account or FI metadata; do not label QBO write compatible |
| IIF target import UAT | **NOT RUN / BLOCKER** | Requires backup, version and transaction-type test |
| Browser visual screenshot | PASS, static render | Headless Chromium rendered desktop 1440px and mobile 390px HTML/CSS; checked no horizontal overflow. Local HTTP navigation was blocked, so these used in-memory page content. |
| Real Chrome file workflows | PASS, synthetic CI | GitHub Actions Google Chrome/Playwright served generated dist over localhost, uploaded CSV and QBO, validated mapping/acknowledgement/clear, and downloaded inspected QuickBooks CSV, XLSX and batch ZIP/JSON; zero browser exceptions. Hosted preview interaction and real bank/QuickBooks UAT are distinct, NOT RUN. |
| Lighthouse / Core Web Vitals | NOT RUN | Production URL unavailable |
| Stripe or subscriptions | NOT IMPLEMENTED | No merchant credentials; no paid CTA |
| Custom domain and GSC | NOT CONFIGURED | User has not purchased a domain |

**Decision:** functional local browser acceptance validated on synthetic fixtures. Production SEO, bank-specific compatibility and commercial launch still require realistic source/target software UAT and a production domain.

## V0.3 — data-integrity extension

- 250/250 deterministic checks PASS; GitHub Actions run 41787228124 SUCCESS.
- Added three-column QuickBooks Online CSV format, safe 1,000-row and 350 KB splitting, large ZIP regression, duplicate warnings, optional local mapping template and anonymous audit report.
- New browser interaction and real QuickBooks import tests NOT RUN. Preview stays noindex.

## V0.4 (2026-11-04)

- LOCAL PASS: 254 unit/property/build tests and preview-noindex build.
- LOCAL PASS: multi-account OFX import now fails closed, investment OFX and QIF refuse unsupported records.
- LOCAL PASS: QIF/IIF source date order appears outside CSV mapping controls and changes trigger reparsing.
- Browser interaction check: NOT RUN for V0.4 until newly deployed preview can be exercised; previous V0.3 checks do not automatically validate changes.
- QuickBooks Online/Desktop real import: NOT RUN; bank identity and target-account version remain unverified.
- Cloudflare deployment: NOT VERIFIED for V0.4 until GitHub CI and Pages run complete.

## V0.5 — separate bank-export batch processing (2026-11-04)

- LOCAL PASS: 262 deterministic Node tests and preview-noindex build.
- Source-account isolation: separate per-file parsing; invalid file aborts entire batch, no automatic merges or deduplication.
- Manifest includes sensitive aggregates, counts, formats and warnings, but not source filenames or transaction descriptions. Stays local.
- QuickBooks import: NOT RUN. Real Web Connect `.qbo` writing: NOT IMPLEMENTED.
- Browser smoke and Cloudflare deployment: NOT VERIFIED until validated separately.

### V0.5 post-commit verification (2026-11-04)
- GitHub CI: **PASS** on commit `368bf7e9f95ca1e20839b834a454cd78fafc88ad`, workflow run https://github.com/garrison2025/CSV-QBO/actions/runs/41790194923 (262 deterministic tests; build successful).
- Local headless Chromium **PASS (isolated in-memory HTML/module integration, not live-site navigation)**: 2 QIF files selected through the real input, separate ZIP generated with `converted-001.csv`, `converted-002.csv` and `batch-validation.json`; no page JavaScript errors; 390px viewport had no horizontal overflow.
- Cloudflare page sampled after code commit: fetched HTML still lacked the batch section, so the V0.5 hosted deploy is **NOT VERIFIED**. Do not claim Cloudflare production or Preview passed V0.5 until the served HTML changes.
- Actual QuickBooks Online/Desktop import UAT: **NOT RUN**. No `.qbo` writer is available.

## V0.6 incremental improvement — 2026-11-04

- CSV input row-width, quoting and ambiguous mapping reject unsafe conversions, with dedicated automated regression cases.
- Downloadable synthetic CSV/QBO/QFX/OFX/QIF/IIF samples generated at build time and checked by parser tests.
- Users can clear the single-file preview and source text in memory without refreshing; local batch files are a separate workspace and downloads persist on disk.
- GitHub CI and target-software browser/UAT outcomes must be recorded separately; QBO/IIF import verification remains NOT RUN.
- Remains preview/noindex; no production domain or verified checkout.


## V0.6.1 financial integrity and lifecycle patch — 2026-11-04

- Added tests for non-USD financial input rejection, missing OFX currency warning, CSV null-byte validation, and invalid XLSX control characters.
- Clear Workspace now invalidates both single/batch reads, clears batch ZIP references, and resets selected file lists.
- Automated tests and preview gating: verify in PR CI before merge. Live Cloudflare smoke and actual QuickBooks import: NOT RUN in this patch.

## V0.7 integrated release — 2026-11-04

- Safer record boundaries: fail on malformed or truncated OFX STMTTRN aggregates; refuse missing payee/description and invalid timestamp clocks.
- QIF section isolation: only explicit Bank, CCard and Cash single-type sections; category/split information remains a documented warning, N check/reference field is emitted in QIF.
- Monetary safety: preserve V0.6.1 non-USD rejection, additionally reject internal whitespace that could otherwise change numeric value.
- Keep V0.6.1 safeguards: CSV null-byte and XLSX control-character rejection, asynchronous stale-read protection, and complete batch/single-file memory reset.
- Synthetic regressions were added; determine final test count/CI and deployment verification after the PR has passed.
- QuickBooks/Quicken software import, bank fixture compatibility and commercial payment acceptance are NOT RUN.

## V0.8 — IIF group integrity and source-coverage reports (2026-11-04)

- Parse-only IIF protection: require valid TRNS, SPL, and ENDTRNS sequence; zero-sum check in USD integer cents per group, not just totals across the whole file.
- Strict failure for missing headers, orphan legs, no SPL, unbalanced split sums or truncated records. Invalid IIF blocks all exports.
- Synthetic two-group IIF example is now balanced. SPL allocations are never reconstructed in CSV/XLSX; TRNS summary must not be treated as a bank statement.
- Batch JSON v2 and single validation summary v2 include IIF parser evidence and file date coverage, while excluding source filenames/account numbers/descriptions.
- Status pending CI and live deployment check; real QuickBooks target UAT remains NOT RUN. Preview still noindex.

## V0.9 — CSV preflight and review controls (2026-11-04)

- QuickBooks CSV generation now includes a round-trip, parse-after-serialize check per part, verifying counted rows, byte lengths, date ranges and exact cents before allowing any export.
- Multi-part ZIPs include `quickbooks-csv-validation.json`: per-part row counts/bytes, aggregate debit/credit/net and privacy-sanitized warning counts, with no original filenames or transaction descriptions.
- Warned single-file exports now require an explicit user acknowledgement; duplicates are not removed. Warnings include CSV formula-looking payees that receive a protective apostrophe prefix.
- This validation is NOT real QuickBooks import UAT or Web Connect `.qbo` creation. The site remains noindex; payment and production SEO remain gated.
- CI pass and live Cloudflare verification to be confirmed at merge.

## V1.0 — OFX / QBO / QFX bank-format variant integrity (2026-11-04)

- In-browser byte decoding: UTF-8 strict, UTF-16 BOM, and OFX1.x declared Windows-1252, with no uploads. Unknown declarations, invalid text sequences, and null bytes cause explicit failure.
- OFX SGML/XML transaction values: CDATA and numeric entities supported; malformed, duplicate or nested transaction fields and failed bank STATUS reports fail closed.
- Verified bookkeeping semantics: signed TRNAMT is authoritative; TRNTYPE alone never flips debit/credit. Missing FITID/TRNTYPE count warnings but does not fabricate references.
- Added separate synthetic XML and legacy 1252 fixtures with browser download links. No real banking data or bank-specific UAT used.
- Source-level parserIntegrity counts are included in existing batch validation. Original filenames, account numbers and payee descriptions are excluded from validation reports.
- CI test count and Cloudflare deployment verification pending; Pages preview still noindex and real QuickBooks import NOT RUN.

## V1.1 — statement retrieval-window integrity (2026-11-04)

- OFX BANKTRANLIST is enforced as one complete statement aggregate; malformed/incomplete, duplicated or reversed date-range definitions block conversion.
- DTSTART/DTEND express bank system-search window (exclusive end), not guaranteed DTSTART<=DTPOSTED<DTEND; posted dates outside retrieval dates are counted and WARNED without dropping rows.
- Parser integrity metadata records the date-only start and end (inclusive/exclusive), missing reference counts and posted-date exceptions, without account IDs or user transaction labels.
- Batch JSON and single file JSON inherit parser integrity fields; browser shows a separate bank retrieval period notice. Synthetic test samples and compatibility page are aligned.
- Original OFX spec: https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%202.2.pdf (section 3.2.7); bank import UAT NOT RUN; Cloudflare Pages preview noindex.
- CI and Cloudflare deployment verification to be recorded after successful merge.

## V1.2 — CSV mapping freshness and workspace review safety (2026-11-04)

- CSV/TSV column mapping changes now atomically invalidate previously approved previews, duplicate audits, warning acknowledgements, validation reports and export button state.
- Date-order changes and clearing the workspace use the same explicit invalidation path; failed previews cannot retain an earlier successful financial summary.
- Added simulated DOM integration tests for click/change listeners, preview outcomes, duplicate warning acknowledgement and async file selection reset; these are NOT real QuickBooks or live-browser UAT.
- Static build asserts download-report remains disabled before preview. Cloudflare Pages noindex release gate unchanged.
- GitHub CI and Cloudflare deployment evidence recorded separately after merge.

## V1.3 — QIF source integrity and cross-file batch overlap review (2026-11-04)

- QIF bank reader now rejects overwritten duplicate financial fields, mismatched T/U amounts, repeated type headers, unknown field codes and incomplete metadata-only entries.
- QIF lossy metadata fields are disclosed with count-only parser integrity metadata; supported U amounts are checked rather than used to duplicate or replace T.
- Batch report adds cross-file matching ID/fingerprint counters and ordinal matches against earlier inputs, preserving separate outputs and never deleting rows. Same reference in different accounts is only a possible overlap.
- Batch byte caps use original file byte counts passed through browser File.size, avoiding false UTF-8 re-encoding size inflation for older OFX files.
- No names, account numbers or transaction reference values are written into validation JSON. Real bank UAT and target accounting import not performed.
- Github CI and Cloudflare preview check pending; noindex release gate maintained.

## V1.4 — Chrome E2E and typed-array ZIP performance (2026-11-04)

- **PASS in GitHub CI**: 334 Node financial/parser/build tests and SEO noindex gates, plus **real Google Chrome** tests against locally served generated `dist/`. Evidence: https://github.com/garrison2025/CSV-QBO/actions/runs/41810408569
- Chrome uploaded synthetic CSV, selected the QuickBooks CSV formatter, verified calculated cents, downloaded and inspected an actual `.csv`; modifying source column mappings invalidated the previously approved export.
- Chrome required acknowledgement for duplicate bank transactions, preserved both rows, then verified Clear workspace disabled stale export/report buttons.
- Chrome read a synthetic `.qbo` statement and downloaded `.xlsx`; ZIP entries were inspected to verify workbook XML and amounts.
- Chrome uploaded two overlapping synthetic `.qif` source files into batch mode, checked duplicate warnings and explicit acknowledgement, downloaded a ZIP and verified two independent CSV outputs plus a privacy-minimized JSON manifest with no reference IDs or transaction descriptions.
- The expanded Chrome matrix also confirms local Windows-1252 OFX decoding and UTF-8 CSV download, the experimental CSV-to-QIF file download, and a 390px viewport with no horizontal overflow. Evidence: https://github.com/garrison2025/CSV-QBO/actions/runs/41810778149
- **ZIP memory improvement:** generator now preallocates a single `Uint8Array` buffer and writes local/central headers with `DataView`; no large intermediate boxed-number arrays. Added 10 MiB synthetic file test, UTF-8 multi-entry and central directory offset checks.
- All source files in browser acceptance are synthetic. The CI runs against `dist/` served on localhost, **not** against a production QuickBooks tenant or real bank account. Production-domain user acceptance, Web Connect `.qbo` writing, QuickBooks acceptance and bank-specific validation remain **NOT RUN / NOT RELEASED**.
- Browser tests are CI-only and install `playwright-core` transiently; the published site itself still has zero runtime npm dependencies and no paid API.
- GitHub main merge SHA and Cloudflare Pages successful deployment: to be verified after release merge.

## V1.5 — QuickBooks CSV exact ordered-row preflight (2026-11-04)

- The previous preflight re-parsed outputs and checked row totals and USD cents, but could not independently detect altered transaction descriptions or reordered rows when totals stayed unchanged.
- New `validateQuickBooksCSVParts(source,parts,limits)` checks exactly one serialized Date/Description/Amount triple for each original row in order, with explicit US date, cent value, Unicode/multiline description and spreadsheet-formula guard reconciliation.
- Report v2 records safe ordinal source row ranges and whether ordered rows, descriptions and amount strings were reconciled. No account IDs, source filenames, payee text or transaction descriptions are included.
- Tests cover swapped rows, altered payees, date changes, omitted/extra rows, modified formula prefixes, encoding and small row/byte limits; Chrome E2E checks real 1001-row split ZIP and JSON receipt.
- This does not imply QuickBooks import UAT and does not create Web Connect `.qbo` files. Domain still absent; Cloudflare Pages remains noindex.
- CI/Cloudflare results must be verified separately after merge.

## V1.6 — OFX structural comment, CDATA and STATUS boundary validation (2026-11-04)

- New equal-length markup-only view keeps XML comments and CDATA content from manufacturing bank STMTTRN records, account sections or server status blocks, without losing genuine CDATA transaction descriptions.
- STATUS blocks require paired open/close delimiters and a numeric zero CODE; missing or nonzero codes block export. XML-declared feeds reject missing leaf-tag closers for date, amount, description, memo, reference and related extracted fields; OFX SGML legacy bare leaves remain supported.
- Security regression tests cover CDATA fake transaction amounts, comment fake bank errors/multiple accounts, truncated XML fields, missing/nested/stray STATUS blocks, and safe text-only rendering of script-looking literals.
- Real Chrome E2E exercises synthetic adversarial OFX XML file selection, transaction preview and actual CSV download. No genuine customer/bank data used.
- QuickBooks import UAT remains NOT RUN; production SEO remains blocked until a custom domain and explicit release.
- CI/Cloudflare release evidence to be verified after merge.

## V1.7 — all-rows transaction preview and cross-page duplicate review (2026-11-05)

- Replaced the former first-8-rows preview with read-only 25-row pagination for all single-file converter pages. The visible range and page count are explicit and the entire source count is preserved.
- Users can advance through possible duplicate rows by original source row number (both first-seen and later match). Flagged rows are highlighted but no transaction is deleted and export covers every original row.
- CSV mapping/date changes, source replacement and clear-workspace reset preview page, navigation, flagged-row focus and export readiness together.
- Node simulated DOM tests cover pages 1-3, the final partial page, duplicate rows located on later pages, reset, and small files without unnecessary navigation.
- Chrome E2E uses a 1,001-row sample across 41 pages, verifies row 1001 visually, then downloads the full two-file QuickBooks ZIP; another 52-row sample tests duplicate jump row 2/51 and warning acknowledgement.
- No change to file conversion logic or QuickBooks import certification. Preview remains noindex and browser local.
- Verify CI and Cloudflare deployment results separately after merge.

## V1.8 — browser-only full-source search and duplicate review filter (2026-11-05)

- Added full-source transaction search by description, date, signed amount and reference, plus a possible-duplicates-only filter on all 12 real conversion pages.
- Searches and duplicate view filters affect **visible preview only**; parsed source, audit warnings, user acknowledgement, reconciliation, validation reports and exported artifacts are unchanged.
- Filter count, empty state, page status and source row review jumps are updated consistently. All query/filter state resets on new file, changed date/mapping or workspace clear. No search terms persisted or uploaded.
- Node simulated-DOM tests and real Chrome E2E cover 1,001-row search, zero matches while export remains available, and duplicate-only inspection of later source rows.
- Real bank and QuickBooks acceptance still NOT RUN; production SEO launch blocked until the user has a custom domain and explicit approval.
- GitHub CI and Cloudflare deployment status to be verified after code merge.

## V1.9 — QIF Bank export lossless-field protection (2026-11-05)

- The old QIF serializer silently flattened newlines and carets in descriptions, references and memo fields, even though the full value matters for finance reconciliation.
- New writer preserves literal carets and UTF-8; rejects control chars/CR/LF in all QIF text fields with a source row index, without including sensitive original text in its error.
- Preflight re-parses the generated QIF and compares each row's date, signed amount, description, reference and memo in original order; a mismatch fails the export atomically before browser download.
- Node tests cover full 1200-row roundtrip, Unicode, caret preservation, invalid source values, private failure messages and source immutability. Chrome E2E exercises caret QIF download and multiline payee failure.
- The generated CSV-to-QIF landing page explains what is and is not represented, and expressly excludes real finance application import certification.
- This is not real QuickBooks UAT, a new `.qbo` writer or proof of universal QIF dialect support. Preview remains noindex.
- CI, main merge and Cloudflare deployment evidence should be recorded separately after verification.

## V2.0 — XLSX native date and exact-cent numeric cells (2026-11-05)

- Prior XLSX writer emitted dates as inline text, preventing reliable native Excel date filtering/sorting. It emitted invalid or non-canonical amount strings as text instead of rejecting them.
- Native Excel 1900 date serials with 1900-02-29 offset and stable yyyy-mm-dd style; correctly typed signed numeric amounts with two-decimal format, exact-cent validation against integer-cent input. No bank data altered.
- Reference IDs remain text preserving leading zeros; payees are inert inline strings. XML-preserving carriage returns, invalid control/surrogate rejection, and 32,767-character Excel cell limit guard are added. Sheet includes frozen headers and autofilter.
- Node tests verify date serials (1900-01-01=1, 1900-02-28=59, 1900-03-01=61, 2026-11-04=46330), amounts down to 0.01 and up to supported limit, text preservation and invalid input failures.
- Independent Python standard-library OOXML/ZIP gate parses a synthetic workbook and checks CRC, styles, date/money cells, literal formula-looking text, and preserved leading-zero reference IDs. Real Chrome downloads are also inspected.
- This remains synthetic structural/data validation. Actual Microsoft Excel desktop/QuickBooks financial import UAT not performed. Preview stays noindex; no custom domain or paid APIs.
- GitHub main CI and Cloudflare release evidence must be verified separately after merge.

## V2.1 — CR-only legacy QIF/IIF input newline compatibility (2026-11-05)

- Previously QIF/IIF split input only at LF and CRLF; CR-only exports from legacy Mac workflows could be parsed as a single record or rejected.
- Shared `financialLines` helper now handles bare CR, LF, CRLF, and mixed sequences, solely at physical record boundaries. No changing description content, cents, ID, type or date values.
- Strict fail-closed QIF `^` and IIF TRNS/SPL balancing checks remain. Batch output still separates source files; partial ZIP archives remain forbidden.
- Added Node parity tests against LF, mixed and CR-only for two-to-three financial records, UTF-16LE QIF BOM, and malformed CR-only no-terminator/unbalanced cases. Chrome E2E uploads CR-only QIF and IIF and checks real XLSX downloads.
- Four relevant tool pages disclose limited newline support. This is not a real-bank compatibility certificate or proof of QuickBooks app import acceptance; `noindex` remains in place.
- Verify GitHub CI and Cloudflare release checks after merge.

## V2.2 — OFX XML entity and mixed-content financial field integrity (2026-11-05)

- Corrected OFX/QFX/QBO XML leaf extraction to concatenate escaped normal text, literal CDATA, and comment-separated fragments without silently dropping post-CDATA text or copying comment contents into payees/references.
- OFX XML entity resolution now rejects unknown/case-invalid named entities, incomplete/bare ampersands, numeric references to invalid XML code points (including control chars, surrogates and U+FFFE/U+FFFF), and direct illegal XML characters, without echoing private bank transaction values in UI errors.
- Classic OFX 1.x SGML remains permissive of literal ampersands in merchant fields; no new dependencies, network fetches or DTD resolution.
- Added regression tests for exact Unicode/CDATA/escaped text reconstruction, XML entity errors, source-to-CSV consistency and Chrome valid/invalid OFX uploads.
- Six OFX/QFX/QBO converter pages disclose limitations; no real-bank acceptance or QuickBooks import certification has been performed. Preview remains noindex.
- GitHub/Cloudflare release evidence must be verified after merge.

## V2.3 — explicit Memo retention and compatible opt-in CSV/Excel exports (2026-11-05)

- Optional CSV source Memo/Notes mapping avoids assigning the same physical source column to both Description and Memo. Multiline quoted and whitespace-sensitive Memo text is preserved in browser memory.
- Generic CSV and XLSX opt-in `Memo` column defaults off to preserve four-column contract; QIF M record remains supported. Excel stores Memo as inert inline text, formula-looking CSV text is guarded.
- QuickBooks Online export explicitly stays three columns and discloses independent Memo omission, rather than silently introducing an incompatible fourth bank-import column.
- Single-file preview and search expose Memo, show row count with separate Memo, and state clearly whether it will be included or omitted; clearing/changing a source resets memo selection.
- Batch option regenerates ZIP upon preference change, counts Memo-bearing rows and omitted rows in privacy-minimized JSON, requires warning acknowledgement on omission, and preserves account separation.
- Node core/UI/batch/build and real Chrome E2E cover mapping, quote/newline values, memo output opt-in, malicious formula-like strings, warning/review reset and actual CSV/XLSX/ZIP downloads.
- QuickBooks target-app acceptance and real-bank provider dialects remain NOT TESTED; technical preview remains noindex and no paid APIs are used.
- CI/Cloudflare release evidence must be verified independently after merge.

## V2.4 — exact generic CSV export reconciliation and source text fidelity (2026-11-05)

- CSV/TSV source parsing now preserves the exact decoded Description and Reference fields, including outer spaces in quoted cells, rather than silently trimming user/bank text. Date and numeric amount remain syntax-normalized; separate Memo remains untouched.
- Generic CSV outputs on both single-file and batch ZIP paths now use `genericCSVExportPlan`: re-encode/reparse generated UTF-8, reconcile each source row in source order, compare original date, integer-cent signed amount, full description, ID and optional Memo, and allow only deliberate spreadsheet-formula apostrophe guarding.
- The validation summary exposes only row/column counts, memo presence/omission counts, guarded-cell counts and true/false reconciliation flags; source bank details are excluded from reports and errors.
- New tests attack tampered dates, merchant descriptions, IDs, amounts, Memo, headers, row counts, absent formula guards, invalid unicode/NUL, and 1,200 Unicode/multiline records. Chrome file uploads validate exact whitespace preservation in QIF→CSV and quoted CSV→QIF, without an unsupported data conversion.
- Existing QuickBooks Online 3-column report/CSV export, native Excel typed cells and QIF M records remain as before. Real bank/provider and QuickBooks import UAT NOT RUN; technical preview remains noindex.
- CI/Cloudflare evidence follows after verified release.

## V2.5 — strict IIF transaction schema and duplicate money aliases (2026-11-05)

- Prior IIF `fields()` silently ignored extra tab-separated TRNS/SPL cells and invented empty trailing values when a data row was shorter than its `!TRNS`/`!SPL` header. These malformed files could look successful while losing bank/accounting fields.
- Parser now rejects all declared header/row width mismatches, empty column names and additional ENDTRNS fields with source row count but never private values.
- When AMOUNT and AMT are both populated, exact signed integer cents must agree; one alias may be blank, or a file may use AMT alone. A mismatch blocks the whole file/ZIP, never a partial output.
- Node tests cover missing/extra columns, alias mismatch for both transaction and split records, cent accuracy, malformed terminators, header errors, and atomic batch rejection; Chrome E2E checks actual XLSX output and stale download blocking after invalid file upload.
- Both IIF tools disclose that they export only validated TRNS summaries, not reconstructed ledgers or verified QuickBooks imports.
- No paid API, backend bank uploads or premature production indexing. Record GitHub and Cloudflare evidence after release verification.

## V2.6 — contradictory accounting amount sign fail-closed guard (2026-11-05)

- Shared `toMinorUnits` previously toggled its negativity flag twice for a parenthesized negative with an inner minus (`(-12.34)`), silently converting a debit into positive money. The defect was reproducible across CSV, QIF, OFX/QBO/QFX and IIF paths.
- The parser now allows exactly one negative sign convention: outer accounting parentheses OR a leading minus. Contradictory mixed signs and incomplete parentheses are rejected early with generic, privacy-safe messages. Existing valid signed cent amounts remain unchanged.
- Node tests verify acceptable negatives, protected malformed variants, all four parser families, and all-or-nothing batches. Chrome acceptance downloads valid negative CSV and verifies an invalid QIF source removes stale preview/export.
- All 12 landing pages disclose the amount-sign rule; `noindex,nofollow` remains the preview policy. Real bank provider and QuickBooks import acceptance are not claimed.
- GitHub CI and Cloudflare deployment evidence to be confirmed after merge.

## V2.7 — evidence pipeline, NOT a real bank import result (2026-11-05)

- Implemented a privacy-allow-listed registry and case validator for future genuine bank-export UAT and QuickBooks/Quicken target imports. Documentation: [REAL-BANK-UAT.md](REAL-BANK-UAT.md).
- Initial public registry: **0** owner-reviewed real-bank source cases, **0** QuickBooks target imports, **0** Quicken target imports. Tests of the registry guard are artificial and do not increase those numbers.
- Public compatibility page now derives its evidence ledger from the registry and refuses unsupported status claims; private originals, transaction aggregates, file hashes and screenshots must never be committed.
- New CI validation checks the public registry schema and scope. The correct evidence claims remain **NOT TESTED**, even if CI/Chrome passes. Cloudflare Pages deployment of V2.7 requires verification after merge.
- Open release blockers: real authorized bank exports, per-row private reconciliation, actual QuickBooks test-company import screenshots/row-cents confirmation and duplicate reimport observation, target-specific .qbo writing (not implemented).

## V2.8 — real-file cross-file verification support, no bank acceptance claimed (2026-11-05)

- Added private local CLI comparing the ACTUAL source bytes with the ACTUAL exported CSV/QIF bytes for supported directions; records SHA-256, row/date/text/order/exact cents validation, and redaction-safe reporting.
- CSV input mappings are explicit and checked. Original-bank statement row-count/net-cent independent baseline is optional but, if supplied, must match; blank evidence never auto-promotes to PASS.
- Draft is deliberately unapproved: manual source authenticity, ledger field preservation and downstream QuickBooks/Quicken test-company import are still required. Source records, amounts, original hashes and screenshots stay private.
- XLSX and multi-part QuickBooks CSV validation through this CLI are currently unsupported and clearly rejected; regular browser converter features unchanged.
- Real-bank variants verified: **0**. Actual QuickBooks target imports verified: **0**. Existing synthetic checks are separate.
- CI and Cloudflare Pages evidence should be verified per merged commit; this tool has no bank-file network calls.

## V2.9 — target import environment correction and SEO release hard block (2026-11-05)

- Intuit developer Sandbox FAQ explicitly states Sandbox companies **cannot import or export data**; do not count sandbox API tests as manual bank CSV acceptance. Test Drive demos are not reliable manual-import evidence. Use an authorized upload-capable trial/test company and manual import receipt, or mark NOT RUN.
- Original bank-source samples reviewed: **0**. Actual QuickBooks bank CSV import receipts reviewed: **0**. No compatibility claim upgraded.
- SEO publish mode now requires custom HTTPS domain, explicit owner approval per route, corresponding privacy-reviewed real-bank read UAT case and KD<=29. Without approvals, even PUBLISH_SEO=true stays noindex/robots-disallow with no sitemap.
- The technical gate cannot verify the truth of human observations and does not constitute bank or Intuit certification. Browser and synthetic CI tests remain separate evidence classes.
- Official source: https://static.developer.intuit.com/output_html/qbo/docs/develop/sandboxes/sandbox-faqs.html; import instructions: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-transactions/manually-upload-transactions-quickbooks-online/L0rE9OXBz_US_en_US

## V2.10 — independently authored fictional bank-format samples (2026-11-05)

- New independent third-party Apache-2.0 fictional source suite: six bank-style CSV shapes (Chase, Bank of America, Wells Fargo, American Express, Capital One, Discover) and legacy Quicken QIF; hard-coded expected row counts and signed totals; Chrome browser upload-to-download coverage.
- Fixed rejected legacy Quicken QIF apostrophe-year convention (`03/15'24` => 2024-03-15) with explicit 20YY warning, without guessing ambiguous two-digit slash-years.
- Known limitations: Wells Fargo-like blank Payee requires explicit Memo-to-Description mapping; Amex/Discover positive credit-card purchase amount polarity requires actual target account type review. No auto-inversion or certification.
- Authentic bank export cases reviewed: **0**. QuickBooks app target imports: **0**. See [independent sample report](INDEPENDENT-SAMPLE-VERIFICATION.md).

## V2.11 — downloaded XLSX and split QuickBooks ZIP cross-file UAT (2026-11-05)

- Previously unsupported private input-original → downloaded XLSX now has independent strict ZIP central/local, stored member, CRC32, inline text and XML worksheet inspection. Exact dates, numeric signed cents, references, descriptions, order and opt-in Memo must match the parsed original. A missing nonempty source Memo blocks approval. Tampered data and unexpected formula content are rejected.
- QuickBooks multipart ZIP is checked across all consecutively numbered CSV parts and bundled manifest, including row/cent/source order. No missing parts, silent shifts or report alterations are permitted. No Web Connect .qbo writing is claimed.
- These checks require original downloaded bytes, not files re-saved in an unrelated compression dialect. Existing original-banking and target-software acceptance **remain 0 observed**. Search publication remains blocked until real-bank owner-reviewed evidence.

## V2.12 — CSV-mapping usability safety (2026-11-05)

- An externally authored Wells Fargo-style fictional CSV has an entirely blank Payee column but a filled Memo column. Previously the generic parser correctly stopped with Description empty, but did not explain the common mapping remedy. The site now provides an **explicit** user-operated remap button when every nonempty source row meets that condition. No automatic data rewriting or payee inference occurs.
- The validator scans the all-row column fill summary in memory and retains counts, not source transaction strings, for the mapping hint. Advice disappears as soon as mappings change or a different file is opened; a fresh preview is mandatory before exporting.
- CSV headers with multiple Transaction/Posted Date choices now show a date review warning. Summary labels no longer assert that positive charges mean money in; they refer to signed positive/negative totals.
- Independently sourced mock shapes and real Chrome upload/preview/download tests are technical evidence only: genuine bank UAT = **0**; actual QuickBooks imports = **0**.

## V2.13 — CSV date/amount preflight validation (2026-11-05)

- Added non-guessing CSV date-risk detection for numeric dates valid and different in both US and day-first orders. The chosen date order is honored exactly, an aggregate risk count is shown, and downloadable file export is gated behind explicit warning acknowledgment. Changing date order resets preview and export authorization.
- Corrected silent financial zero: blank Debit + Credit cells in a populated transaction row now reject rather than produce 0.00. Explicit 0.00 is not discarded but is flagged for review.
- An absolute transaction amount at least USD 1,000,000 is flagged for review rather than automatically changed or rejected. This threshold is a review aid only, not currency conversion, a statutory limit or evidence of transaction error.
- Aggregate date/zero/high-amount risk counts are recorded in local validation reports; QuickBooks split-output manifest retains aggregate zero and high-value counts. Tests cover US/EU dates, browser download acknowledgment, actual serialized cents, manual date selection and refusal of blank split amounts.
- **Authentic bank issuer file evidence: 0. Observed QuickBooks imports: 0.** No new claims of bank certification or target import success.

## V2.14 — OFX/QFX/QBO corrected transactions and timezone safety (2026-11-05)

- Consulted official [OFX 2.2 specification](https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%202.2.pdf), especially section 3.2.8 (dated time/zone representation), section 3.2.9.2 (statement TRNAMT signage), and the STMTTRN record definition (correction actions).
- OFX STMTTRN `CORRECTFITID` or `CORRECTACTION` indicates a prior bank history operation (`DELETE` or `REPLACE`), which a stateless CSV extraction cannot reproduce safely. The parser now rejects the whole file, even when fields are empty/invalid, instead of exporting these records as normal new transactions. The error omits corrected transaction reference data. This is a deliberate unsupported feature rather than an unverified claim of applied corrections.
- For explicit OFX DEBIT/CREDIT types with a contradictory signed `TRNAMT`, aggregated warnings require user review; source cents and source order remain unchanged. Other types may legitimately have either sign, and no sign correction is inferred.
- Checked OFX time zone GMT offsets against ±12 hours, with fractional-hour values accepted. Posting calendar dates remain as bank provided (not normalized to user's local time or UTC).
- Added independent synthetic SGML/XML fixtures including CDATA/comments, DELETE/REPLACE actions, corrupted offsets, benign types and real Chrome upload/download gate tests. **Live bank-issuer UAT: 0. Actual QuickBooks/Quicken import UAT: 0.** No page index approval.

## V2.15 — OFX account-scoped FITID and identity integrity (2026-11-05)

- The official OFX 2.2 specification, §3.2.3 ([Financial Institution Transaction ID](https://www.financialdataexchange.org/common/Uploaded%20files/OFX%20files/OFX%202.2.pdf)), states FITIDs must be unique **within an account**, but are not unique across institutions/accounts. Identical FITIDs may indicate duplicate response rows. This validation is **per individual source statement**, not global.
- In one OFX/QBO/QFX source, any repeated nonempty FITID whose normalized posting date, signed cents, description, Memo or TRNTYPE differs now **rejects the entire source** with ordinal-only error messages. No partial exports, synthetic corrections or redacted FITID values in logs.
- Exact repeated FITIDs remain as multiple rows; a separate parser-level warning and existing generic audit warning require explicit acknowledgment, never silently deduplicate. Count-only `integrity.repeatedFitidCount` is included in private local validation summaries and batch ZIP reports. Records without FITID still generate missing-reference warnings; identifiers are never invented.
- More than one structural BANKACCTFROM/CCACCTFROM marker in the same source is rejected even when STMTRS count alone would not reveal account mixing. XML comments and CDATA containing fake tags are inert. Across **separate** batch files, matching FITIDs remain possible-overlap warnings, because different accounts may reuse values; no account merging occurs.
- Local validation does **not** establish completeness of bank statement history, independently match bank-issued original balances or reconcile a closing LEDGERBAL to beginning balance + transaction deltas. Existing DTSTART/DTEND review is only bank retrieval-window metadata.
- Test evidence: deterministic synthetic OFX SGML/XML same-FITID cases, mutated date/amount/payee/memo/type, private-ID leak checks, safe comment/CDATA, mixed identity tags, all-or-nothing batch conversion and actual Chrome file upload/download with unchanged row count and signed cents.
- **Authentic real-bank files with owner signoff: 0. Actual QuickBooks manual imports verified: 0.** No bank issuer-specific compatibility or SEO publication approval.

## V2.16 — bank balance metadata structure and no-false-reconciliation rule (2026-11-05)

- Added strict detection of the optional OFX `LEDGERBAL` and `AVAILBAL` aggregates and validation of their `BALAMT` signed USD cent precision and `DTASOF` timestamps, for both SGML and XML. Multiple, malformed, invalid, partially missing or nested balance aggregates reject the **entire** file. Valid negative ledger balances are retained as syntactically valid.
- Privacy design: source balance numbers are not returned from `parseOFX` and are **never** written into downloadable validation summaries, compatibility pages or batch ZIP JSON. Only booleans for ledger/available presence, as-of dates and `independentReconciliationPerformed:false` are retained.
- Website preview states whether each balance type was supplied and its as-of date, explicitly marking `NOT reconciled`. Even exact parsed transaction cents and a well-formed closing ledger balance do **not** establish completeness: there is no independently verified opening balance or bank-authorized full posting history. Do not compare the sum of the selected bank retrieval window against closing balances and call it settled.
- Inert XML comments and CDATA cannot inject or delete balance groups. Real Chrome upload + download tests verify as-of notes, warning acknowledgement, private report redaction and duplicate balance refusal. Additional Node tests check SGML/XML, duplicate/malformed, missing, negative, range and batch handling.
- All fixtures are synthetic; **authentic bank original/UAT accepted: 0, observed QuickBooks imports: 0**. The public site remains SEO-blocked. No claims of audited financial reconciliation or certified downstream imports.

## V2.17 — OFX balance statement-scope and post-as-of review (2026-11-05)

- Discovered a source-to-account attribution gap: V2.16 validated balance syntax globally but could associate an orphan `LEDGERBAL`/`AVAILBAL` outside the containing bank/card response with transactions extracted from an unrelated response. V2.17 requires every balance element to be structurally inside **one complete** `STMTRS` or `CCSTMTRS` and a co-located, complete `BANKTRANLIST`. Balance groups incorrectly inside the transaction list also fail closed. XML comment/CDATA strings remain inert.
- A count-only `balanceReview.statementScoped` boolean indicates local structural validation only. No original account identifiers, ledger/available amounts or source content are retained in validation summaries.
- `postedAfterLedgerAsOfCount` highlights source rows whose posted calendar day occurs *after* the bank-supplied ledger balance `DTASOF`. A visible review warning explicitly says the mismatch may be legitimate and does not establish a reconciliation error or justify deleting rows. No income, ledger or balance reconstruction is performed.
- New synthetic tests: orphan and wrongly closed statement responses, balance elements wrongly within BANKTRANLIST, complete CCSTMTRS, post-ledger-dated transactions, signed-cent preservation, CSV preview acknowledgment and downloadable privacy-scrubbed JSON. **Genuine bank originals reviewed = 0; QuickBooks manual imports observed = 0.**
