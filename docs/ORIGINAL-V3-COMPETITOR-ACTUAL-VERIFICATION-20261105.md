# Original V3 comparator verification — 2026-11-05

## Sources and intent

The user-provided source project specification `CSV_QBO_完整建站与SEO方案_V3_含250关键词_20261104.md` identifies two original competitor SEO/feature research anchors: **AccountingConverter** and **DocuClipper**. Its central, P0 landing route is `/tools/csv-to-qbo/`, which requires producing a real Web Connect `.qbo` file; an unrelated QuickBooks **three-column CSV** formatter is not equivalent.

This report is an actual automated browser observation, not marketing-summary inference. Only 2 fictional transactions were used (2026-10-14, Fictional Espresso, -12.50; 2026-10-15, Fictional Refund, +20.75, net +8.25). No real bank user data, login credentials, payment method, identity, CAPTCHA bypass or unauthorized account actions were used.

## Real Chrome browser observations

Run: https://github.com/garrison2025/CSV-QBO/actions/runs/41987344999

Screenshot + machine-readable JSON artifact (7-day retention): https://github.com/garrison2025/CSV-QBO/actions/runs/41987344999/artifacts/13397036072

Run's source file SHA-256: `b4e52b86155c49a79c7245eacd8e1babcae34937f7cd584c4faddbfc0bd443c8`.

| Site | Action observed | External response | Output | Strict conclusion |
|---|---|---|---|---|
| https://accountingconverter.com/tools/csv-to-qbo | Loaded public CSV→QBO page. Browser selected fictional CSV; filename appeared. | Browser observed multiple HTTP **403** responses from its own API endpoints, including `/api/institutions`, `/api/quota` and `/api/process-pdf-stream`. Page showed **Forbidden**. | No downloadable .qbo | **INCONCLUSIVE/BLOCKED**. Cannot assess actual output because a download was not produced. This does not prove the provider is broken for ordinary users. |
| https://www.docuclipper.com/solutions/convert-csv-to-qbo/ | Opened marketing page. Public start-converting CTA was followed. | Redirected/navigated to DocuClipper `/signup/` (page title `Create Your DocuClipper Account`). No public input form for conversion was reached without authentication. | No downloadable .qbo | **INCONCLUSIVE/ACCOUNT REQUIRED**. Do not invent an account or claim the converter fails. |

The two sites themselves present CSV→Web Connect QBO conversion as a product capability, but those **marketing claims are not independent transaction-file evidence**. The browser did not execute any actual QuickBooks Online bank-feed import; that is an entirely separate test.

## Contrast with already independently verified third-party QBO

Sonomir was **not one of the two original V3 competitor sites**, but it independently generated a real 923-byte `.qbo` from fictional input. Its downloaded bytes are preserved in `tests/fixtures/sonomir-synthetic-qbo-20261105.base64`, with real SHA-256 pinned, and the QBO→CSV and QBO→Excel read-only routes both passed exact row/date/payee/amount reconciliation. Reference: [COMPETITOR-READ-ACCEPTANCE-20261105.md](./COMPETITOR-READ-ACCEPTANCE-20261105.md).

This is a **QBO read-path** result. It is **not** the original critical **CSV→Web Connect QBO writer** output. Current site cannot honestly claim that original P0 route is implemented, compared with original competitors, or approved for SEO.

## Project release conclusion

1. AccountingConverter: **no observed downloadable output, blocked by Forbidden / HTTP 403** in this environment.
2. DocuClipper: **product conversion requires an account**, so no unauthenticated conversion result was obtained.
3. Original competitors' actual QBO byte/transaction outputs: **none obtained**; **no passed comparator acceptance from those two**.
4. Existing Sonomir real-output fixture: **PASS, but only for the independently tested QBO→CSV and QBO→Excel read routes**.
5. CSV→QBO P0 function: **not implemented** in the current website and cannot be silently replaced by the existing QuickBooks three-column manual-upload CSV formatter.
6. QuickBooks target-account imports observed: **0**; authentic bank-account export originals approved: **0**.

No change to current owner-reviewed route-level approval file or existing index gates is supported by the original competitor probes. Current public Cloudflare preview remains noindex/nofollow; a separately approved custom domain is needed for actual SEO release. Future CSV→QBO writer acceptance can use **independent observed competitor-generated QBO** from a no-login converter such as Sonomir (plus serializing a valid OFX/QBO wire), but that still must not be presented as QuickBooks official certification.

One-time probe script remains at `scripts/probe-original-v3-competitors.mjs` for reproducibility. The one-time CI trigger was removed after collecting the real result to avoid repetitive third-party requests.
