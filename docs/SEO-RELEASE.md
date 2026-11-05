# SEO intake and release policy

**Evidence:** owner-provided Semrush US natural-ranking CSV for AccountingConverter (100 records) and DocuClipper (200 records); 250 distinct phrases after de-duplication, captured 2026-11-04. Research is not a promise of ranking or traffic. Only target KD<=29 as a new-site entry point.

## Intent -> canonical tool mapping

The 250 terms are stored in `data/keywords-250.json` with source domain, US volume, KD, CPC, historical competitor estimate and source route. Synonyms such as `csv to qbo`, `csv to qbo converter`, and `csv to qbo converter free` share ONE planned canonical intent, not multiple thin pages.

- `/tools/csv-to-qbo/`: KD 5, volume 1,300, **BLOCKED** until real `.qbo` writer and target import test pass.
- `/tools/qbo-to-csv/`: KD 2, volume 590; reader implemented.
- `/tools/qbo-to-excel/`: KD 2, volume 1,000; reader and `.xlsx` writer implemented.
- `/tools/qif-to-excel/`: KD 3, volume 480; limited bank-field reader.
- `/tools/qif-to-csv/`: KD 20, volume 320; limited bank-field reader.
- `/tools/iif-to-csv/`: KD 17, volume 480; TRNS-only reader.
- `/tools/iif-to-excel/`: KD 3, volume 390; TRNS-only reader.
- `/tools/ofx-to-qbo/`: KD 13, volume 590; **BLOCKED** pending target import UAT.
- `/tools/qfx-to-qbo/`: KD 7, volume 720; **BLOCKED** pending target import UAT.
- `/tools/csv-to-iif/`: KD 20, volume 720; **BLOCKED** pending Desktop UAT.
- `/tools/csv-to-qif/`: KD 3, volume 390; syntax output experimental, **noindex** pending downstream import checks.
- `/tools/quickbooks-csv-formatter/`: keyword volume/KD **UNVERIFIED**; format conversion available but stays **noindex** until approved.

## Deterministic build gates

- Preview builds: `noindex,nofollow` and `robots.txt` `Disallow: /`; no canonical/sitemap hostname guessed.
- Production opt-in now requires all of: a real HTTPS custom domain in `SITE_URL`, `PUBLISH_SEO=true`, `data/production-release.json` explicitly owner-approved with reviewed date and route slugs, and a matching owner-reviewed REAL BANK export evidence case in `data/uat-public.json` for each approved route. Only nonbrand `read_only_tested` tool routes with Semrush KD <=29 qualify. Zero accepted evidence and zero owner approvals keep **every page** `noindex` and emit no sitemap even if the production environment variables are accidentally set. `syntax_only`, imported-target-unverified and QBO-writing routes cannot be released automatically.
- Unknown URLs return a real 404 (Cloudflare Pages `404.html`).
- Source content is in initial static HTML; no JS-only headings or link structure.
- No fabricated reviews, stars, traffic, income, savings, conversion rate or QuickBooks compatibility.
- Every production route needs actual parser/serializer tests, independent intent and original format-specific content.
- Validate production canonical and Search Console after domain confirmation; do not submit pages.dev preview as production.


## V2.9 — two independent release conditions (2026-11-05)

1. Complete a genuine bank export acceptance (specific bank, export dialect, region, transaction-level reconciliation, privacy-reviewed evidence). Register only reviewed, sanitized cases in `data/uat-public.json`.
2. Manually approve each exact nonbrand reader slug in `data/production-release.json` with `approved:true`, `reviewed_at`, `reviewer`, and `approved_routes`. This authorizes search indexing **only for evidence-backed reader directions** and is not bank/Intuit certification.

The current production release file starts unapproved with an empty route list. A developer Sandbox cannot import/export bank files, so target QuickBooks CSV UAT must use an authorized, upload-capable trial/test company and observed manual upload, not sandbox success. See [QuickBooks import UAT](QUICKBOOKS-REAL-IMPORT-UAT.md).
