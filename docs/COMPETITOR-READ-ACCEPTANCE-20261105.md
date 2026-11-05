# V2.22 — Competitor-based independent functional acceptance (2026-11-05)

## Decision and evidence hierarchy

Owner's explicit product release criterion: **successful, observed independent competitor output comparison is sufficient for that specifically tested functional route**. A real QuickBooks Online account or bank-customer original is **not** a mandatory website-publication prerequisite. This is an owner-selected engineering acceptance threshold, not a claim of Intuit approval or real bank interoperability.

Do not confuse:
- **Competitor-generated Web Connect QBO -> OUR CSV/Excel readers**: eligible for narrowly scoped comparator acceptance when source, output, exact cents, dates, order, and wire round-trip all agree.
- **OUR CSV -> outgoing Web Connect QBO writer**: NOT implemented and NOT approved by read-path evidence; the released QuickBooks formatter produces a **three-column CSV** for manual import, a different format and capability.
- **Observed QuickBooks software import**: 0. Bank-customer original UAT: 0. These are unchanged.

## Actually executed independent browser evidence

Real Google Chrome on GitHub Actions [41984953445](https://github.com/garrison2025/CSV-QBO/actions/runs/41984953445) visited independent converter [Sonomir CSV -> QBO](https://sonomir.com/csv-to-qbo), submitted **two fictional** transactions, clicked **Download QBO** and obtained an actual **923-byte** Web Connect QBO.

- Original fictional CSV SHA-256: `fcd3ccce6ad75502788e588ac78765954fa16e02d88b409d83f6317ce5de2cd9`.
- Actual Sonomir-generated QBO SHA-256: `00e5202de9a425ed3d0c4fba337271e54cfe8e48a87538c394c378ae95a74e69`.
- Fixture preservation in [tests/fixtures/sonomir-synthetic-qbo-20261105.base64](../tests/fixtures/sonomir-synthetic-qbo-20261105.base64), decoded file starts with OFXHEADER:100, declares USD and contains two synthetic STMTTRN and FITID fields. Byte hash is checked by [tests/competitor-sonomir-read.test.mjs](../tests/competitor-sonomir-read.test.mjs).
- Known original source rows: 2026-10-14 −12.50 (fictional espresso), 2026-10-15 +20.75 (fictional refund), signed total **+8.25**.
- Independently parse downloaded QBO using our OFX reader: 2 rows, same dates, signed exact cents, payee description, order, declared USD, FITIDs present.
- Feed downloaded QBO transactions into **our generic CSV writer**; parse actual CSV wire back, compare dates, payees, exact integer cents and row order with known original source. **PASS.**
- Feed downloaded QBO transactions into **our XLSX writer** and an independent XLSX OOXML ZIP inspector; 2 rows and integer net **825 cents**. **PASS.**

**Scoped result: competitor-read evidence PASS only for QBO → CSV and QBO → Excel, using this particular two-transaction fictional file.** Does not cover arbitrary account banks, all dialects, trailing bank balance tags, duplicates, large files or performance, and cannot prove any actual QuickBooks import.

Other external black-box attempts:
- [AccountingConverter](https://accountingconverter.com/tools/csv-to-qbo) accepted file selection but its page displayed **Forbidden** and produced no QBO download in our GitHub runner ([41982899982](https://github.com/garrison2025/CSV-QBO/actions/runs/41982899982)); **inconclusive**, not passed.
- [StatementEdge](https://www.statementedge.com/tools/csv-to-qbo) returned a .qbo, but our strict reader rejected its malformed/incompatible LEDGERBAL scope. **NOT PASS**, investigation separate; no silent balance correction.
- [CSVdock](https://csvdock.com/csv-to-qbo) loaded an input and selection UI; no download observed. **Inconclusive**.

## Explicit repository acceptance gate

File [data/competitor-read-evidence.json](../data/competitor-read-evidence.json) records this independent synthetic source, downloaded-QBO hash, CI-run, measured bytes/rows/cents, covered routes and zero-bank/zero-QuickBooks facts. Its raw input and downloaded binary bytes are **fictional**, contain no customer's account or login.

Production release code [scripts/production-gate.mjs](../scripts/production-gate.mjs) now supports **either** approved real-bank evidence **or** independently checked competitor read evidence, only for the two matching QBO read routes. It refuses any claim that a competitor download proves an outgoing .qbo writer or a QuickBooks software import. Owner route approval file [data/production-release.json](../data/production-release.json) now approves `qbo-to-csv` and `qbo-to-excel` based on the user's explicit competitor-only release criterion; no other tool or keyword landing page is approved.

Deployment remains `noindex,nofollow` on the existing `https://csv-qbo.pages.dev/` hostname. Only a later verified custom HTTPS domain with `SITE_URL=https://<actual-domain>` and `PUBLISH_SEO=true` can enable indexing for the two approved routes (plus the site's indexable information pages); other tool pages stay noindex and outside sitemap. CI checks a **simulated** custom host for route-level scope but does not deploy that host.

**No new domain was bought, no real QuickBooks login used, no bank-account data uploaded, no Stripe/billing connected and no unsupported CSV-to-QBO export released.** Competitor verification and SEO release are separate from actual accounting-product certification.
