# CSV → QBO Web Connect writer pilot (2026-11-05)

## Purpose and strict acceptance states

The V3 plan names CSV→QBO as its P0 priority. The prior site provided a QuickBooks Online three-column CSV formatter, **not** outgoing Web Connect QBO. AccountingConverter's browser test returned HTTP 403; DocuClipper redirected to signup. Neither original comparator produced a QBO for inspection.

This change adds an **actual OFX 1.02 / .qbo serializer** at the unindexed engineering route `/lab/csv-to-qbo/`. It does **not** register `/tools/csv-to-qbo/`, modify `data/tools.json` or approve any SEO keyword page. Any custom-domain production build still leaves this pilot `noindex,nofollow` and out of the sitemap.

## How metadata works

The site does not offer a default guessed FI/BID and does not preset another bank's branding identity. The user must select an existing bank-issued `.qbo` reference for the same bank/account. A browser-local parser reads the reference, checks supported bank-only OFX 1.x statement structure and extracts FI ORG, FID, INTU.BID, BANKID, ACCTID and ACCTTYPE. The program cannot authenticate the issuer or independently establish account ownership. Users must verify the bank/account match.

Supported writer scope: USD bank CHECKING/SAVINGS/MONEYMRKT, printable ASCII text only, a maximum of 1,000 transactions, exact signed integer cents, no zero amounts, stable per-account FITIDs, strict duplicate rejection, safe OFX escaping, statement date window and a whole-file ordered round-trip check. No card feed, non-ASCII encoding, multi-account merge, balance reconstruction, network calls, bank logins or remote file upload.

## Independent third-party comparator

The existing `tests/fixtures/sonomir-synthetic-qbo-20261105.base64` contains the **real 923-byte QBO** previously downloaded from Sonomir after submitting two fictional rows. New tests use it as a synthetic reference and compare our generated Web Connect output to its independently parsed transaction date, ordered signed amount, payee and net (+825 cents). Different bank response timestamps, FITIDs or serialization order do not require byte-for-byte identity. A separate test inspects wire STMTTRN records directly instead of trusting only the writer's self-check.

The fixture contains Sonomir's test FID/BID 3000 and test account 0000. Those values are NOT baked into user-facing defaults and must not be described as our authenticated bank institution identity.

### Current evidence semantics

| Layer | State | Evidence |
|---|---|---|
| Writes a real `.qbo` Web Connect-formatted file | implemented in feature branch | `src/qbo-writer.mjs` |
| Independent synthetic comparator transactions | automated test implemented; CI result must be checked | `tests/qbo-writer.test.mjs` |
| Browser upload, preview, download | requires Chrome Actions acceptance | `/lab/csv-to-qbo/` |
| Real QuickBooks import | NOT verified (0 observed) | no UAT evidence |
| Real bank reference authenticity / software version interoperability | NOT verified | no approved evidence |
| Public `/tools/csv-to-qbo/` SEO release | NOT approved | release gate unchanged |

Only `syntax_valid_only` is a justified label until target-software import succeeds on named bank, account and QuickBooks configurations. The existing owner-selected competitor-output acceptance criterion supports exact functional validation of generated transaction data, not official compatibility claims.

## Executed acceptance and deployment evidence — 2026-11-05

- Feature PR [#46](https://github.com/garrison2025/CSV-QBO/pull/46) squash-merged to `main` commit `80ee48ccf05b9e6a11cd8a412bb42acc0a692fa1`.
- Feature-branch full CI and real Chrome [#41991061284](https://github.com/garrison2025/CSV-QBO/actions/runs/41991061284): **success**. Chrome selected fictional CSV and the previously downloaded real Sonomir QBO as reference, downloaded an actual `.qbo`, and verified two ordered transactions and exact net **825 cents**. Replacing a CSV invalidated stale export; local Clear reset both file selections; mobile layout and page JS-error checks passed.
- Main-branch CI [#41991208644](https://github.com/garrison2025/CSV-QBO/actions/runs/41991208644): **success** after merge.
- Cloudflare Pages reported successful deployment for merge commit. A separate live fetch confirmed `https://csv-qbo.pages.dev/lab/csv-to-qbo/` returns the pilot page with `robots=noindex,nofollow`. This live fetch checked page content and metadata, not a live browser file upload; the latter was independently exercised against the built site in GitHub Actions Chrome.
- Engineering acceptance is strictly **synthetic comparator data agreement / syntax-valid QBO wire / browser download passed**. Actual QuickBooks import **0 observed**. Original AccountingConverter and DocuClipper outgoing bytes **not obtained**. Never label this target-software compatibility verified.

## Remaining gate

Verify CI and the real Chrome download before merging this feature branch. Retain the reference's authorized provenance and a separate QuickBooks target-version import record when eventually assessing actual software interoperability. Keep the root site and this pilot unindexed on the pages.dev preview until a real production hostname is explicitly approved.