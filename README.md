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

## V0.3 — browser-local data integrity workflow

- Export **three-column QuickBooks Online CSV**, not Web Connect \`.qbo\`. Dates use explicit US \`MM/DD/YYYY\` and decimal amounts are verified with integer-cents.
- Automatically split large CSV exports into parts of at most **1,000 transactions / 350 KB** each. Multi-part results are downloaded as a ZIP. Files are **not** uploaded to a server.
- Validate dates, descriptions and debit/credit conflicts; alert on duplicate transaction references and possible duplicate records **without changing or removing any row**.
- Download an aggregate **validation-summary.json** containing transaction totals and row indices, never descriptions or account numbers.
- Users may opt in to saving a local CSV column-mapping template; only column headers and positions are stored in that browser, not bank transactions.
- Verified by **249 local automated tests** and [GitHub CI](https://github.com/garrison2025/CSV-QBO/actions). No actual receiving-software import tests have run.

The project remains a technical preview on \`csv-qbo.pages.dev\` with \`noindex\` and blocked robots. These enhancements do **not** establish Desktop \`.qbo\` writer compatibility or paid SaaS readiness.

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

`npm test` currently runs unit, property-style and build gates. A **synthetic test suite is not a substitute for real QuickBooks UAT**, browser interaction testing, mobile QA, or a security audit. Consult [docs/RELEASE-EVIDENCE.md](docs/RELEASE-EVIDENCE.md).

> Independent utility. Not affiliated with Intuit, QuickBooks, Quicken, or a bank. Financial source files should be backed up; verify imports with the receiving application.
