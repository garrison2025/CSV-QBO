# Finance File Lab — project design system

- **Surface and audience:** transaction file converters for American bookkeepers, small-business owners, and accounting practitioners; Operate-first, precision-sensitive.
- **Visual personality:** calm editorial fintech; neutral canvas, deep ink, restrained teal accent; trust conveyed by real file flows and explicit compatibility limits, not invented testimonials.
- **References:** the user-provided AccountingConverter tool flows, DocuClipper financial-file workflow, and `chenmu2024/Website-Starter-Standard` design/SEO standards. Learn from the task structure, do not copy branding or source code.
- **Design controls:** Variance 4/10, Motion 3/10, Density 6/10; file upload and result controls occupy the first screen on desktop and appear immediately after the page purpose on mobile.
- **Colors:** `--canvas:#f5f9f7`, `--paper:#fff`, `--ink:#153239`, `--accent:#0e8175`, `--line:#dfebe9`, `--red:#ad4438`; no extravagant gradients or neon.
- **Type:** system UI sans fallback `Inter, ui-sans-serif, -apple-system, Segoe UI`; body 16px/1.6; H1 fluid 2.55–4.55rem with tight tracking; technical copy 12–13px.
- **Layout:** 1160px max, 44px combined desktop gutters; responsive one-column at <=1000px; mobile 30px gutter. Real data tables are horizontally scrollable instead of shrinking text to illegibility.
- **Shapes:** inputs/buttons 9–10px; tiles 13px; primary workbench 17px; pills full radius only.
- **Buttons and controls:** green primary for real enabled downloads only; disabled download until valid preview; high-contrast focus ring; explicit errors and status text with `aria-live`.
- **Motion:** subtle hover translation and background color only; `prefers-reduced-motion: reduce` removes transitions. Never delay the file upload task or hide core information pending JS.
- **Accessibility:** semantic labels, keyboard focus, meaningful empty/error/success states, no icons as the only feedback, real HTML headings and links.
- **Iconography:** small inline SVG document/upload/lock motifs, no external image dependencies, no irrelevant stock portraits.
- **Guardrails:** preview builds remain `noindex`; no claims of bank, QuickBooks import, paid subscription, testimonials or reviews without evidence; dates and amounts always require review.
