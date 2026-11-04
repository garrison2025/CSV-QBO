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

## V0.3 incremental release — 2026-11-04

- `npm test`: **250/250 PASS** locally; updated GitHub Actions run [41787228124](https://github.com/garrison2025/CSV-QBO/actions/runs/41787228124) completed **success**.
- `npm run build`: **PASS** locally with 12 tool pages and preview noindex.
- New deterministic checks: QuickBooks Online CSV headers/date order, split at 1,000 rows/350 KB, UTF-8 byte limits, conflicting debit/credit, duplicate audit, mixed CSV/XLSX ZIP generation.
- Online user-visible checks: initial preview `csv-qbo.pages.dev` returned homepage and read-only tools with `noindex`; **V0.3 live deployment not yet confirmed when this note was written**.
- Interactive/browser smoke of V0.3: **NOT RUN** in this environment because Chromium navigation was blocked by runtime policy. V0.2 browser smoke evidence above does not automatically validate V0.3.
- Receiving QuickBooks/Quicken import: **NOT RUN**; no claims of certified compatibility.

**Decision:** a demonstrable free browser-local prototype that can be deployed to preview. Production SEO and commercial launch require manual UI/UAT and actual receiving-software compatibility evidence.

- **Large ZIP check:** fixed argument-spread overflow and added 350 KB ZIP regression; 250/250 tests pass.

## V0.4 incremental release — 2026-11-04

- LOCAL PASS: 254 unit/property/build tests and preview-noindex build.
- LOCAL PASS: OFX multiple account sections and investment files now fail closed.
- LOCAL PASS: QIF/IIF source date order is visible and changes trigger reparsing.
- Browser smoke for V0.4: NOT RUN in this environment; Chromium local navigation was blocked.
- QuickBooks target import: NOT RUN; do not claim compatibility.
- GitHub CI / Cloudflare deployment: check separately after commit.
