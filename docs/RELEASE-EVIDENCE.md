# Release evidence log — 2026-11-04

| Gate | Status | Evidence / limitation |
|---|---|---|
| Source specification read | PASS | User-provided V3 including 250 keyword appendix |
| Internal financial precision | PASS, synthetic cases | Integer-cent amounts, strict date parser, CSV/QIF/OFX/IIF limited readers |
| Automated tests | PASS locally | 250 Node test cases on current working tree (including generated property cases) |
| XLSX structural sample | PASS locally | .xlsx opened with openpyxl; numeric values and strings checked |
| SEO planned route gate | PASS locally | Preview noindex; blocked CSV->QBO route absent; 250 keywords retained |
| Real QuickBooks Online/Desktop import | **NOT RUN / BLOCKER** | No user-provided target test account or FI metadata; do not label QBO write compatible |
| IIF target import UAT | **NOT RUN / BLOCKER** | Requires backup, version and transaction-type test |
| Browser visual screenshot | PASS, static render | Headless Chromium rendered desktop 1440px and mobile 390px HTML/CSS; checked no horizontal overflow. Local HTTP navigation was blocked, so these used in-memory page content. |
| Browser CSV upload/mapping/preview/download | PASS, limited | Headless Chromium with in-memory HTML/CSS and bundled module imports: uploaded a two-row CSV, selected mappings, previewed two transactions, downloaded bank-converted.csv; no JavaScript page errors. Hosted preview and full real-file matrix remain NOT RUN. |
| Lighthouse / Core Web Vitals | NOT RUN | Production URL unavailable |
| Stripe or subscriptions | NOT IMPLEMENTED | No merchant credentials; no paid CTA |
| Custom domain and GSC | NOT CONFIGURED | User has not purchased a domain |

**Decision:** a demonstrable free browser-local prototype that can be deployed to preview. Production SEO and commercial launch require manual UI/UAT and actual receiving-software compatibility evidence.

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
