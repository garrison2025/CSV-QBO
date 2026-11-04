import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {parseInput,totals,decodeFinancialBytes} from '../src/core.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>readFileSync(path.join(root,'dist',p),'utf8');
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SITE_URL:'',PUBLISH_SEO:''}});
test('preview noindex and robots blocking',()=>{
 assert.match(read('index.html'),/noindex,nofollow/);
 assert.match(read('robots.txt'),/Disallow: \/\n/);
 assert.equal(existsSync(path.join(root,'dist','sitemap.xml')),false);
});
test('no unverified QBO writing SEO landing page',()=>{
 assert.equal(existsSync(path.join(root,'dist','tools','csv-to-qbo','index.html')),false);
 assert.equal(existsSync(path.join(root,'dist','tools','ofx-to-qbo','index.html')),false);
});
test('each generated tool page includes real downloadable workflow and unique H1',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const t of tools){const html=read('tools/'+t.slug+'/index.html');
 assert.match(html,/<h1>/);assert.match(html,/id="file-input"/);assert.match(html,/id="export-button"/);
 assert.match(html,/noindex,nofollow/);assert.match(html,new RegExp(t.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
});
test('keyword database and 27-route plan preserved',()=>{
 const keywords=JSON.parse(readFileSync(path.join(root,'data/keywords-250.json'),'utf8'));
 assert.equal(keywords.length,250);
 assert.equal(new Set(keywords.map(x=>x.keyword)).size,250);
 assert.equal(keywords.find(x=>x.keyword==='csv to qbo converter').kd,5);
 const plan=JSON.parse(readFileSync(path.join(root,'data/seo-plan-v3.json'),'utf8'));
 assert.equal(plan.pages.length,27);
});


test('every published reader offers a synthetic fixture matching its input format',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const tool of tools){
   const filename=tool.input+'-synthetic.'+tool.input;
   const location='samples/'+filename;
   assert.ok(existsSync(path.join(root,'dist',location)),location+' should exist');
   const page=read('tools/'+tool.slug+'/index.html');
   assert.ok(page.includes('/'+location),tool.slug+' must link its source fixture');
   const parsed=parseInput(read(location),tool.input,{dateFormat:'us'});
   assert.equal(parsed.transactions.length,2,tool.slug+' synthetic sample row count');
   assert.equal(totals(parsed.transactions).net,'107.50');
 }
 assert.match(read('index.html'),/samples\/csv-synthetic\.csv/);
});
test('clear workspace control is available on every converter page',()=>{
 assert.match(read('index.html'),/id="clear-workspace"/);
 assert.match(read('tools/qbo-to-csv/index.html'),/id="clear-workspace"/);
});

test('Clear workspace covers batch state and asynchronous file-read guards',()=>{
 const html=read('index.html');
 assert.match(html,/id="clear-workspace" type="button">Clear workspace/);
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/selectionEpoch\+\+/);
 assert.match(app,/batchEpoch\+\+/);
 assert.match(app,/if\(epoch!==selectionEpoch\)return/);
 assert.match(app,/if\(epoch!==batchEpoch\)return/);
});


test('all single-file converter workspaces expose an explicit warning acknowledgement control',()=>{
 for(const route of ['index.html','tools/qbo-to-csv/index.html','tools/quickbooks-csv-formatter/index.html']){
  const html=read(route);
  assert.match(html,/id="warning-ack-label"/);
  assert.match(html,/id="warning-ack"/);
  assert.match(html,/I have reviewed these format and duplicate warnings/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/quickBooksCSVExportPlan\(parsed.transactions\)/);
 assert.match(app,/quickbooks-csv-validation\.json/);
 assert.match(app,/warning-ack'\)\.checked/);
});


test('OFX XML and Windows-1252 synthetic variants parse to two reconciled bank rows',()=>{
 for(const [filename,expectedEncoding,firstName] of [
  ['ofx-xml-synthetic.ofx','utf-8','Sample café & bookstore'],
  ['ofx-win1252-synthetic.ofx','windows-1252','Sample café']
 ]){
  const bytes=readFileSync(path.join(root,'dist','samples',filename));
  const decoded=decodeFinancialBytes(bytes,'ofx');
  assert.equal(decoded.encoding,expectedEncoding,filename);
  const parsed=parseInput(decoded.text,'ofx');
  assert.equal(parsed.transactions.length,2,filename);
  assert.equal(parsed.transactions[0].description,firstName,filename);
  assert.equal(parsed.integrity.recordCount,2,filename);
  assert.equal(totals(parsed.transactions).net,'107.50',filename);
 }
 const page=read('tools/ofx-to-csv/index.html');
 assert.match(page,/\/samples\/ofx-xml-synthetic\.ofx/);
 assert.match(page,/\/samples\/ofx-win1252-synthetic\.ofx/);
 assert.match(page,/noindex,nofollow/);
});
test('bank file inputs are decoded by strict byte readers, including batch mode',()=>{
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/decodeFinancialBytes/);
 assert.match(app,/chosen\.arrayBuffer\(\)/);
 assert.match(app,/selected\.arrayBuffer\(\)/);
 assert.ok(!app.includes('await chosen.text()'));
});


test('synthetic OFX/QBO/QFX statement windows are declared and complete',()=>{
 for(const filename of ['ofx-synthetic.ofx','qbo-synthetic.qbo','qfx-synthetic.qfx','ofx-xml-synthetic.ofx','ofx-win1252-synthetic.ofx']){
  const bytes=readFileSync(path.join(root,'dist','samples',filename));
  const ext=filename.split('.').pop();
  const {text}=decodeFinancialBytes(bytes,ext);
  const data=parseInput(text,ext);
  assert.equal(data.integrity.statementRange.startInclusive,'2026-11-04',filename);
  assert.equal(data.integrity.statementRange.endExclusive,'2026-11-06',filename);
  assert.equal(data.integrity.postedBeforeRangeCount,0,filename);
  assert.equal(data.integrity.postedAfterRangeCount,0,filename);
 }
});
test('bank source preview displays retrieval period, without suggesting it is ledger reconciliation',()=>{
 for(const page of ['index.html','tools/qbo-to-csv/index.html','tools/ofx-to-csv/index.html']){
  assert.match(read(page),/id="statement-coverage"/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/Bank retrieval period/);
 assert.match(app,/end exclusive/);
 assert.match(app,/posted outside the displayed dates; no rows were removed/);
 const compatibility=read('compatibility/index.html');
 assert.match(compatibility,/DTSTART\/DTEND are retrieval windows/);
 assert.match(compatibility,/not guaranteed DTPOSTED coverage/);
});


test('a validation JSON download is unavailable until the current file has passed preview',()=>{
 for(const route of ['index.html','tools/quickbooks-csv-formatter/index.html','tools/ofx-to-csv/index.html']){
  assert.match(read(route),/id="download-report" class="subtle-btn" disabled/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/function invalidatePreview\(\)/);
 assert.match(app,/Column mapping changed\. Preview transactions again/);
 assert.match(app,/report\.disabled=true/);
 assert.match(app,/download-report'\)\.disabled=false/);
});


test('batch UI preserves original file sizes and reports cross-file overlaps without merging accounts',()=>{
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 const batch=readFileSync(path.join(root,'src','batch.mjs'),'utf8');
 assert.match(app,/byteLength:selected\.size/);
 assert.match(app,/crossFileReferenceMatches\+batchInfo\.report\.crossFileFingerprintMatches/);
 assert.match(batch,/crossFileMatchesAreWarningsOnly:true/);
 assert.match(batch,/matchedEarlierFileNumbers/);
 assert.match(batch,/autoMergedAccounts:false/);
 assert.match(batch,/autoDeletedTransactions:false/);
 const page=read('tools/qif-to-csv/index.html');
 assert.match(page,/unknown codes fail with an error/i);
 assert.match(page,/noindex,nofollow/);
});


test('OFX compatibility documentation describes structural CDATA and bank status guards',()=>{
 const html=read('compatibility/index.html');
 assert.match(html,/BANKTRANLIST\/STATUS boundaries checked/);
 assert.match(html,/CDATA and comment text cannot create transactions or bypass status errors/);
 assert.match(html,/noindex,nofollow/);
 const core=readFileSync(path.join(root,'src','core.mjs'),'utf8');
 assert.match(core,/function ofxViews\(source\)/);
 assert.match(core,/Unclosed OFX bank STATUS/);
});


test('all conversion pages provide working paginated preview and suspicious-row navigation controls',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const t of tools){
  const html=read('tools/'+t.slug+'/index.html');
  for(const control of ['preview-navigation','preview-previous','preview-next','preview-page-status','preview-review']){
   assert.ok(html.includes('id="'+control+'"'),t.slug+' must include '+control);
  }
  assert.match(html,/noindex,nofollow/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/const PREVIEW_PAGE_SIZE=25/);
 assert.match(app,/function renderPreviewPage\(\)/);
 assert.match(app,/reviewRows=\[\.\.\.new Set/);
 assert.match(app,/Preview only — downloads include all/);
});


test('all twelve conversion tools expose browser-local preview search and duplicate-only review controls',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const tool of tools){
   const html=read('tools/'+tool.slug+'/index.html');
   for(const id of ['preview-search','preview-only-flags','preview-filter-status'])
     assert.ok(html.includes('id="'+id+'"'),tool.slug+' missing '+id);
   assert.match(html,/preview-search" type="search"[^>]*autocomplete="off"/);
   assert.match(html,/noindex,nofollow/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/function matchingPreviewIndices\(\)/);
 assert.match(app,/parsed\.transactions/);
 assert.match(app,/Preview only — downloads include all/);
 assert.match(app,/preview-search'\)\.value=''/);
});


test('CSV to QIF landing page discloses strict lossless fields and no target-app certification',()=>{
 const html=read('tools/csv-to-qif/index.html');
 assert.match(html,/QIF uses one physical line for each field/);
 assert.match(html,/QIF Bank export is generated entirely in your browser/);
 assert.match(html,/compatibility with specific accounting apps remains unverified/);
 assert.match(html,/noindex,nofollow/);
 const source=readFileSync(path.join(root,'src','core.mjs'),'utf8');
 assert.match(source,/QIF export self-check failed/);
 assert.match(source,/QIF cannot preserve it exactly/);
 assert.ok(!source.includes("String(t.description||'').replace(/[\\r\\n^]/g,' ')"),
  'QIF writer must never silently replace payee data');
});


test('XLSX converter pages state true Excel dates, two-decimal money and text-safe references',()=>{
 const data=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 const excelTools=data.filter(x=>x.output==='xlsx');
 assert.equal(excelTools.length,5);
 for(const x of excelTools){
  const html=read('tools/'+x.slug+'/index.html');
  assert.match(html,/Excel date cells are real sortable dates/);
  assert.match(html,/Signed amounts are validated to integer cents/);
  assert.match(html,/references including leading zeros stay text/);
  assert.match(html,/noindex,nofollow/);
 }
 const source=readFileSync(path.join(root,'src','xlsx.mjs'),'utf8');
 assert.match(source,/function excelDateSerial/);
 assert.match(source,/function exactExcelAmount/);
 assert.match(source,/numFmtId="164" formatCode="yyyy-mm-dd"/);
 assert.match(source,/autoFilter ref=/);
});


test('QIF and IIF tool docs disclose CR-only compatibility and preview remains noindex',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 const legacyTools=tools.filter(x=>x.input==='qif'||x.input==='iif');
 assert.equal(legacyTools.length,4);
 for(const item of legacyTools){
  const html=read('tools/'+item.slug+'/index.html');
  assert.match(html,/Legacy Mac-style CR-only line endings/);
  assert.match(html,/CRLF and LF\/mixed records are supported/);
  assert.match(html,/Record counts and signed transaction values are never normalized/);
  assert.match(html,/noindex,nofollow/);
 }
 const core=readFileSync(path.join(root,'src','core.mjs'),'utf8');
 assert.match(core,/function financialLines\(text\)/);
 assert.match(core,/split\(\/\\r\\n\|\\n\|\\r\/\)/);
});


test('OFX/QBO/QFX pages disclose exact mixed-XML text preservation and XML entity rejection',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 const relevant=tools.filter(x=>['qbo','qfx','ofx'].includes(x.input));
 assert.equal(relevant.length,6);
 for(const tool of relevant){
  const html=read('tools/'+tool.slug+'/index.html');
  assert.match(html,/OFX 2.x XML bank text now combines ordinary text, CDATA and comment-separated fragments/);
  assert.match(html,/unknown\/invalid XML entities are rejected/);
  assert.match(html,/OFX 1.x SGML still accepts literal ampersands/);
  assert.match(html,/noindex,nofollow/);
 }
 const parser=readFileSync(path.join(root,'src','core.mjs'),'utf8');
 assert.match(parser,/function ofxTextSegments\(fragment,xml=false\)/);
 assert.match(parser,/Malformed or unsupported OFX XML character entity/);
});
