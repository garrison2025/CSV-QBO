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

## V0.5.1 — financial integrity and local-file lifecycle

- Defensive CSV parsing: quoted delimiters, CR/CRLF/LF records, strict malformed-quote rejection and null-byte checks.
- Explicit non-USD currency symbols and non-USD OFX statements fail closed. Undeclared OFX currency prompts a verification warning; no exchange-rate conversion.
- XLSX rejects invalid XML control characters rather than generating corrupted workbooks.
- Single and batch async reads cannot restore stale inputs after a newer selection; **Clear workspace** immediately removes in-memory source content, preview, audits and batch ZIP.
- Detects UTF-8 replacement characters and asks users to re-export questionable bank files.
- Regression tests added. Receiving-software QuickBooks import acceptance remains **NOT RUN**.

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

`npm test` currently runs unit, property-style and build gates. A **synthetic test suite is not a substitute for real QuickBooks UAT**, browser interaction testing, mobile QA, or a security audit. Consult [docs/RELEASE-EVIDENCE.md](docs/RELEASE-EVIDENCE.md).

> Independent utility. Not affiliated with Intuit, QuickBooks, Quicken, or a bank. Financial source files should be backed up; verify imports with the receiving application.
