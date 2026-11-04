# Release evidence log — 2026-11-04

| Gate | Status | Evidence / limitation |
|---|---|---|
| Source specification read | PASS | User-provided V3 including 250 keyword appendix |
| Internal financial precision | PASS, synthetic cases | Integer-cent amounts, strict date parser, CSV/QIF/OFX/IIF limited readers |
| Automated tests | PASS locally | 243 Node test cases on current working tree (including generated property cases) |
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
