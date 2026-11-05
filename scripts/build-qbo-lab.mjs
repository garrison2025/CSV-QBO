/**
 * Build an unindexed, standalone engineering pilot.
 * Never register this route as a released keyword converter or include it in sitemap.xml.
 */
import fs from 'node:fs';
import path from 'node:path';

export function writeQboLab(dist,root){
  const assetDir=path.join(dist,'assets');
  fs.copyFileSync(path.join(root,'src','qbo-writer.mjs'),path.join(assetDir,'qbo-writer.mjs'));
  fs.copyFileSync(path.join(root,'src','qbo-writer-ui.mjs'),path.join(assetDir,'qbo-writer-ui.mjs'));
  const html=String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="description" content="Unindexed technical preview: locally generate and inspect Web Connect QBO file syntax from CSV and user-supplied bank QBO metadata. Compatibility is unverified.">
<title>CSV → QBO Web Connect — Experimental Local Lab | Finance File Lab</title>
<link rel="stylesheet" href="/assets/styles.css"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
.lab-hero{padding:72px 0 28px;background:linear-gradient(125deg,#edf9f4,#f7f9fc)}
.lab-wrap{max-width:1080px;margin:auto;padding:0 22px}
.lab-hero h1{max-width:760px;font-size:clamp(2rem,5vw,3.5rem);letter-spacing:-.045em;line-height:1.1}
.lab-hero p{max-width:740px;color:#4a5966;font-size:1.05rem;line-height:1.75;margin-top:16px}
.lab-kicker{font-size:.72rem;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:#087568}
.lab-stage{background:#fff;border:1px solid #e1ebe8;box-shadow:0 12px 48px #0e34210c;border-radius:22px;padding:26px;margin:24px 0}
.lab-stage h2{font-size:1.2rem;margin-bottom:8px}
.lab-stage .lab-tip{font-size:.85rem;line-height:1.7;color:#566673;margin:0 0 18px}
.lab-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.lab-field{display:flex;flex-direction:column;gap:7px;font-size:.88rem;font-weight:650}
.lab-field input,.lab-field select{min-width:0;width:100%;border:1px solid #c9d8d5;border-radius:10px;padding:12px;background:#fff;color:#172a29}
.lab-field input:focus-visible,.lab-field select:focus-visible,.lab-button:focus-visible{outline:3px solid #0e81755e;outline-offset:2px}
.lab-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
.lab-button{background:#087e70;color:#fff;padding:14px 22px;border:0;border-radius:12px;font-size:.95rem;font-weight:750;cursor:pointer}
.lab-button:disabled{background:#b9c9c6;cursor:not-allowed}
.lab-link{color:#0a756d;text-decoration:underline}
.lab-note{border-left:4px solid #bc8c3c;background:#fff7e9;padding:15px 18px;font-size:.87rem;line-height:1.65;border-radius:0 10px 10px 0}
#lab-status{margin:20px 0;padding:15px 18px;background:#f0f5f5;border-radius:12px;line-height:1.6;white-space:pre-wrap}
#lab-status[data-kind="error"]{background:#fff1ed;color:#9e3624}
#lab-status[data-kind="success"]{background:#eaf7f0;color:#126c43}
.lab-scroll{overflow:auto;max-height:320px}
.lab-table{border-collapse:collapse;width:100%;min-width:540px}
.lab-table th,.lab-table td{text-align:left;padding:10px 12px;border-bottom:1px solid #e2ebe8;font-size:.84rem}
.lab-table th{background:#f5f9f8}
.lab-ack{display:flex;align-items:flex-start;gap:9px;font-size:.85rem;line-height:1.6;margin:18px 0}
.lab-ack input{margin-top:5px}
.lab-meta{font-size:.83rem;color:#566673;margin-top:12px}
@media(max-width:720px){.lab-grid,.lab-options{grid-template-columns:1fr}.lab-stage{padding:18px}.lab-hero{padding:48px 0 24px}}
</style></head>
<body><header class="topbar"><div class="container topbar-content"><a class="brand" href="/">Finance File Lab</a><nav class="main-nav" aria-label="Navigation"><a href="/">Home</a><a href="/compatibility/">Compatibility</a></nav></div></header>
<main><section class="lab-hero"><div class="lab-wrap"><span class="lab-kicker">Experimental · Unindexed · Browser local</span>
<h1>CSV to a real <span style="color:#0e8175">Web Connect .qbo</span> file</h1>
<p>Inspect the CSV, use a QBO file from your own bank/account for institution metadata, then generate a new OFX 1.02 QBO file entirely in this browser. This is a syntax-only pilot, not a verified QuickBooks import converter.</p></div></section>
<div class="lab-wrap">
<section class="lab-stage"><h2>01 / Choose both source files</h2>
<p class="lab-tip">No upload to our server. Your bank QBO reference is used only to copy the FI/BID and bank/account metadata locally. You must verify it belongs to the same bank/account as the CSV.</p>
<div class="lab-grid"><label class="lab-field">Transactions CSV<input type="file" id="lab-csv" accept=".csv,.tsv" aria-label="Transactions CSV"></label>
<label class="lab-field">Existing bank-issued QBO reference<input type="file" id="lab-reference" accept=".qbo" aria-label="Existing bank QBO reference"></label></div>
<p class="lab-meta"><a class="lab-link" href="/samples/csv-synthetic.csv" download>Download synthetic CSV for testing</a>. The synthetic CSV is not bank-issued. An actual QBO reference is still required; this site does not provide or guess a bank BID.</p>
<div class="lab-options">
<label class="lab-field">Source date order<select id="lab-date"><option value="us">US — MM/DD/YYYY</option><option value="eu">Day-first — DD/MM/YYYY</option></select></label>
<label class="lab-field">CSV delimiter<select id="lab-delimiter"><option value="auto">Auto</option><option value="comma">Comma</option><option value="semicolon">Semicolon</option><option value="tab">Tab</option></select></label>
<label class="lab-field">File type scope<select disabled><option>USD bank account only</option></select></label>
</div></section>
<section class="lab-stage"><h2>02 / Confirm CSV column mappings</h2>
<p class="lab-tip">Select columns explicitly. Use either one signed Amount column OR separate non-negative Debit and Credit columns. Do not rely on automatic labels if your bank uses ambiguous headers.</p>
<div class="lab-options" id="lab-mappings">
<label class="lab-field">Date<select data-map="date"></select></label><label class="lab-field">Description<select data-map="description"></select></label>
<label class="lab-field">Signed amount<select data-map="amount"></select></label><label class="lab-field">Debit<select data-map="debit"></select></label>
<label class="lab-field">Credit<select data-map="credit"></select></label><label class="lab-field">Reference / ID<select data-map="id"></select></label>
<label class="lab-field">Memo<select data-map="memo"></select></label></div>
<p class="lab-meta" id="lab-mapping-tip" role="status">Choose a CSV to load its column names.</p>
<div style="margin-top:22px"><button id="lab-preview" class="lab-button" disabled>Preview, write QBO &amp; verify round-trip</button></div>
<div id="lab-status" role="status" aria-live="polite">No file was processed.</div>
<div id="lab-result" hidden><h3>Ordered transaction preview</h3><p class="lab-meta" id="lab-result-summary"></p>
<div class="lab-scroll"><table class="lab-table"><thead><tr><th>Date</th><th>Payee</th><th>Signed USD</th><th>Reference present</th></tr></thead><tbody id="lab-rows"></tbody></table></div>
<p id="lab-warnings" class="lab-note"></p>
<label class="lab-ack"><input type="checkbox" id="lab-ack">I checked the source amount signs, dates, account match and warnings. I understand this QBO has not passed real QuickBooks import testing.</label>
<button class="lab-button" id="lab-download" disabled>Download experimental .qbo file</button>
<p class="lab-meta">Output state: <strong>syntax_valid_only</strong>. No QuickBooks compatibility, bank authentication, or official financial-institution endorsement is claimed.</p></div></section>
<section class="lab-stage"><h2>What this pilot does not do</h2>
<p class="lab-tip">It does not create an institution identity, connect to a bank, certify a Web Connect import, adjust signed amounts, silently remove duplicate rows, or support QFX / credit cards. Non-ASCII transaction text is rejected rather than corrupted. Identical transactions without distinguishing references are rejected.</p>
<div class="lab-note"><strong>Keep the original files.</strong> QuickBooks Desktop imports depend on bank configuration and supported software versions. This result is for controlled validation until target application testing is recorded. The separate QuickBooks Online three-column CSV formatter is a different product.</div></section>
</div></main>
<footer class="footer"><div class="container"><p>Independent experimental utility. No affiliation with Intuit, QuickBooks or any bank.</p></div></footer>
<script type="module" src="/assets/qbo-writer-ui.mjs"></script></body></html>`;
  const filename=path.join(dist,'lab','csv-to-qbo','index.html');
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,html);
}
